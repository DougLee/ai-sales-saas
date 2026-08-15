import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { streamText } from 'ai'
import { createModel } from '../config/model-provider.js'
import { getAIConfig } from '../config/ai-config.js'
import { z } from 'zod'
import { agentMemory } from './core/agent-memory.js'
import { routeIntent } from './core/agent-router.js'
import { buildSystemPrompt } from './core/prompt-builder.js'
import { scanOutput } from './core/guardrails.js'
import { findExpert } from './experts/registry.js'
import { resolveSkills } from './core/agent-skill-router.js'
import { skillRegistry } from './skills/index.js'
import { extractRecommendedCandidates, handleCustomerEnroll } from './skills/crm/customer-enroll.util.js'
import { captureBidResultFromChat, captureGateSignalsFromChat } from './skills/crm/gate-extraction.util.js'
import { semanticSearch } from '../knowledge-base/kb-embedder.js'
import { AppError } from '../errors/app-error.js'
import { ErrorCode } from '../errors/error-codes.js'
import { traceLLMCall } from '../infra/llm-trace.js'
import { getComponentLogger } from '../infra/logger.js'
import { llmConcurrencyLimiter } from '../infra/concurrency-limiter.js'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

const INTENT_LABELS: Record<string, string> = {
  territory_search: '区域客户开发',
  background_research: '客户背景调研',
  visit_preparation: '拜访准备',
  visit_analysis: '拜访复盘',
  demand_mining: '需求挖掘',
  follow_up: '跟进策略',
  lead_assessment: '线索评估',
  project_health: '商机健康分析',
  team_management: '团队/Pipeline分析',
  illusion_detection: '项目风险识别',
  sales_coaching: '销售辅导',
  territory_expansion: '市场开拓',
  customer_enroll: '目标客户入库',
  bidding_monitor: '招投标监测',
  system_help: '系统使用帮助',
  general_chat: '一般对话',
}

export function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

export function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string; role: string; orgId?: string } | undefined
}

export const ChatRequestSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
  id: z.string().optional(),
  sessionId: z.string().optional(),
  pageContext: z.object({
    page: z.string(),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
  }).optional(),
})

export async function chat(req: FastifyRequest, reply: FastifyReply) {
  const body = ChatRequestSchema.parse(req.body)
  const user = req.user as { id: string; tenantId: string; role: string; orgId?: string } | undefined
  const userId = user?.id || 'anonymous'
  const tenantId = user?.tenantId || 'default'
  const orgId = user?.orgId
  const sessionId = body.sessionId || body.id || `sess_${Date.now()}`
  const lastMessage = body.messages[body.messages.length - 1]
  const traceId = req.id || `chat_${Date.now()}`
  const chatLogger = getComponentLogger('chat', { traceId, sessionId, userId, tenantId, orgId })

  // 必须使用租户隔离的 Prisma
  const tenantPrisma = req.tenantPrisma
  if (!tenantPrisma) {
    throw new AppError(ErrorCode.AUTHORIZATION_ERROR, '租户上下文缺失', 403)
  }

  const aiConfig = getAIConfig()
  if (!aiConfig.openaiApiKey) {
    throw new AppError(
      ErrorCode.AI_SERVICE_ERROR,
      'AI 模型未配置。请前往系统设置 → AI 配置，填写 API Key 和模型名称。',
      503,
    )
  }

  try {
    // 保存用户消息到记忆（Redis + 数据库双写）
    const messageTime = new Date()
    await agentMemory.appendMessage(sessionId, {
      role: 'user',
      content: lastMessage.content,
      createdAt: messageTime.toISOString(),
    }, body.pageContext)

    // 同时持久化到数据库
    await tenantPrisma.chatSession.upsert({
      where: { id: sessionId },
      update: {
        updatedAt: messageTime,
        messageCount: { increment: 1 },
      },
      create: {
        id: sessionId,
        tenantId,
        userId,
        title: lastMessage.content.slice(0, 50),
        context: body.pageContext ? JSON.stringify(body.pageContext) : '{}',
        messageCount: 1,
        updatedAt: messageTime,
      },
    })

    await tenantPrisma.chatMessage.create({
      data: {
        sessionId,
        tenantId,
        role: 'user',
        content: lastMessage.content,
        createdAt: messageTime,
      },
    })

    // 意图路由
    const { trace: intentTrace, ...intent } = await routeIntent(lastMessage.content, {
      traceId,
      sessionId,
      userId,
      tenantId,
      orgId,
    })
    chatLogger.info(
      {
        intent: intent.intent,
        confidence: intent.confidence,
        intentTraceId: intentTrace?.traceId,
      },
      'Intent routed',
    )

    // 服务范围：允许所有销售相关意图 + general_chat（让系统 Prompt 引导 LLM 自行判断范围）
    // 硬拦截保留给明确的高风险脱靶（如置信度极低且完全无关）
    const ALLOWED_INTENTS = new Set([
      'background_research',   // 目标客户背景调查
      'territory_search',      // 目标客户检索
      'customer_enroll',       // 目标客户入库
      'territory_expansion',   // 市场开拓
      'visit_analysis',        // 拜访复盘
      'visit_preparation',     // 拜访准备
      'demand_mining',         // 需求挖掘/解决方案支持
      'follow_up',             // 跟进策略
      'lead_assessment',       // 线索评估
      'project_health',        // 商机健康度/评分诊断
      'team_management',       // 项目状况/团队Pipeline分析
      'illusion_detection',    // 项目风险/疑难分析
      'bidding_monitor',       // 招投标监测
      'sales_coaching',        // 销售辅导
      'system_help',           // 系统使用说明
      'general_chat',          // 脱靶意图，由系统 Prompt 引导 LLM 判断是否在服务范围内
    ])

    // 仅当意图完全不在白名单且置信度极低时直接拒绝（兜底保护）
    if (!ALLOWED_INTENTS.has(intent.intent) && intent.confidence < 0.3) {
      const refusal = '我是销售管理助手，专注于销售业务和客户管理相关的问题，比如目标客户调研、拜访准备与复盘、项目分析、解决方案支持等。如有其他需求，请联系管理员。'
      reply.type('text/plain; charset=utf-8').send(refusal)
      await agentMemory.appendMessage(sessionId, {
        role: 'assistant',
        content: refusal,
        createdAt: new Date().toISOString(),
      }).catch((e) => chatLogger.error({ err: e }, 'Failed to save refusal message'))
      return
    }

    // 置信度过低 / LLM 主动要求澄清时才反问（中等置信度已在路由层转为带猜测作答，见 agent-router）
    if (intent.intent === 'clarification' && intent.entityType) {
      const clarifiedIntent = intent.entityType
      const clarificationText = `我不太确定您的具体需求。您是希望进行「${INTENT_LABELS[clarifiedIntent] || clarifiedIntent}」吗？请补充更多细节，我会更准确地帮您。`
      reply.type('text/plain; charset=utf-8').send(clarificationText)
      await agentMemory.appendMessage(sessionId, {
        role: 'assistant',
        content: clarificationText,
        createdAt: new Date().toISOString(),
      }).catch((e) => chatLogger.error({ err: e }, 'Failed to save clarification message'))
      return
    }

    // 获取历史消息（以 DB 为 Source of Truth，避免 Redis TTL 过期导致上下文断裂）
    // 仅取最近 50 条作为 LLM 上下文，防止长会话 Token 爆炸
    const dbMessages = await tenantPrisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { role: true, content: true },
    })
    const messages: ChatMessage[] = dbMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .reverse()
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    // Agent Skill Router：根据意图和页面上下文，决定需要调用哪些 Skill
    const skillCalls = resolveSkills(intent, {
      page: body.pageContext?.page,
      entityType: body.pageContext?.entityType,
      entityId: body.pageContext?.entityId,
    })
    chatLogger.info({ skillCalls: skillCalls.map((s) => s.skillId) }, 'Skills resolved')

    // 并行执行 Skills
    const skillContext = {
      tenantId,
      userId,
      orgId,
      role: user?.role || 'SALES',
      prisma: tenantPrisma,
      traceId,
      sessionId,
    }

    // customer_enroll：在 LLM 生成前执行入库（lead-action），结果注入 prompt 供小销确认
    let enrollNote: string | null = null
    if (intent.intent === 'customer_enroll') {
      try {
        // 倒数第二条若为助手消息，作为指代消解上下文（#22："上边提到的"）
        const prevMsgs = body.messages
        const prevAssistant =
          prevMsgs.length >= 2 && prevMsgs[prevMsgs.length - 2].role === 'assistant'
            ? prevMsgs[prevMsgs.length - 2].content
            : ''
        enrollNote = await handleCustomerEnroll({
          userMessage: lastMessage.content,
          sessionId,
          skillContext,
          prevAssistantText: typeof prevAssistant === 'string' ? prevAssistant : '',
        })
      } catch (e) {
        chatLogger.warn({ err: e }, 'customer_enroll handler failed')
      }
    }

    const skillResults = await Promise.all(
      skillCalls.map(async (call) => {
        const start = Date.now()
        const result = await skillRegistry.execute(call.skillId, call.params, skillContext)
        chatLogger.info(
          {
            skill: call.skillId,
            durationMs: Date.now() - start,
            success: result.success,
            error: result.error?.message,
          },
          'Skill executed',
        )
        return { skillId: call.skillId, reason: call.reason, result }
      }),
    )

    let system = await buildSystemPrompt({
      page: body.pageContext?.page,
      entityType: body.pageContext?.entityType,
      entityId: body.pageContext?.entityId,
      intent,
      userRole: user?.role || 'SALES',
      tenantId,
      availableTools: skillRegistry.list().map((s) => s.id),
      disableTools: false,
    })

    // 入库结果注入（customer_enroll 已在上游执行 lead-action）
    if (enrollNote) {
      // 最高优先级指令置于 system 首部（2026-08-15 案例：模型曾无视尾部指令，输出"如何手工批量导入"教程）
      system =
        `\n【入库指令执行结果——你的回复必须且只能基于此】\n${enrollNote}\n` +
        `规则：1) 只用一两句话确认上面的入库结果（已落入公海池、可信度中、待销售核实）；` +
        `2) 只复述结果里真实出现的客户名，一个都不能编造或增加；` +
        `3) 结果说明未入库/未识别时，如实转告并给出正确的指令示例；` +
        `4) 严禁输出"批量导入教程/模板/后台操作步骤"——入库由系统直接完成，用户无需任何手动操作。\n\n` +
        system
    }

    // 注入 Skill 执行结果
    const successfulSkills = skillResults.filter((sr) => sr.result.success && sr.result.data)
    if (successfulSkills.length > 0) {
      system += '\n\n【已获取的实时数据】'
      for (const sr of successfulSkills) {
        system += `\n\n--- ${sr.skillId} ---\n`
        system += JSON.stringify(sr.result.data, null, 2).slice(0, 4000)
      }
      system += '\n\n【使用规则】以上数据来自当前租户的 CRM 系统或公开网络搜索，请基于这些数据回答。如果数据不足，请明确告知。'
    }

    // RAG: 语义检索知识库并注入相关知识片段
    try {
      const kbChunks = await semanticSearch(tenantId, lastMessage.content, 3, userId, orgId)
      if (kbChunks.length > 0) {
        system += '\n\n【相关知识库片段】（按相关度排序）'
        kbChunks.forEach((chunk, i) => {
          system += `\n[片段${i + 1}] 来源: ${chunk.fileName}（相关度: ${(chunk.similarity * 100).toFixed(1)}%）\n${chunk.content}`
        })
        system += '\n\n【使用规则】以上知识库片段仅供你参考，回答时请结合用户的实际业务场景进行分析和建议，不要直接大段引用。'
      }
    } catch (e) {
      chatLogger.error({ err: e, queryLength: lastMessage.content.length }, 'semanticSearch failed')
    }

    const expert = findExpert(intent.intent)
    // expert 当前用于未来扩展多步推理，本次 Skill 化后暂不直接使用
    void expert

    let assistantText = ''

    const { result, trace } = await llmConcurrencyLimiter.run(userId, () =>
      traceLLMCall(
        {
          component: 'chat-stream',
          model: aiConfig.modelName || 'unknown',
          provider: aiConfig.provider,
          traceId,
          sessionId,
          userId,
          tenantId,
          orgId,
          intent: intent.intent,
        },
        async () => {
          const r = streamText({
            model: createModel() as unknown as Parameters<typeof streamText>[0]['model'],
            system,
            messages,
          } as any)
          return { result: r }
        },
      ),
    )

    const response = result.toTextStreamResponse()
    reply.code(response.status)
    for (const [key, value] of response.headers) {
      reply.header(key, value)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      reply.raw.write(value)
      assistantText += decoder.decode(value, { stream: true })
    }

    // 确定性结果块（#23）：写操作的事实部分不由 LLM 生成——流末追加固定格式确认块并持久化
    if (enrollNote) {
      const block = `\n\n> ✅ **系统执行结果**：${enrollNote}`
      const chunk = new TextEncoder().encode(block)
      reply.raw.write(chunk)
      assistantText += block
    }

    reply.raw.end()

    chatLogger.debug(
      {
        llm: {
          component: 'chat-stream',
          model: aiConfig.modelName,
          latencyMs: trace.latencyMs,
        },
      },
      'Chat stream completed',
    )

    // 推荐类意图：抽取候选目标客户并持久化，供下一轮「入库」使用（响应已 end()，用户无感知）
    if (intent.intent === 'territory_search' || intent.intent === 'territory_expansion') {
      try {
        const candidates = await extractRecommendedCandidates(assistantText)
        if (candidates.length > 0) {
          await agentMemory.setJSON(sessionId, 'recommended-candidates', {
            candidates,
            savedAt: new Date().toISOString(),
          })
          chatLogger.info({ count: candidates.length }, 'Recommended candidates persisted')
        }
      } catch (e) {
        chatLogger.warn({ err: e }, 'candidate extraction/persist failed')
      }
    }

    // #30 gate 字段多来源提取（响应已 end()，用户无感知；只建待确认项不直写，失败静默不阻塞对话）
    const gateProjectId =
      body.pageContext?.entityType === 'project' && body.pageContext.entityId
        ? body.pageContext.entityId
        : undefined
    if (gateProjectId) {
      const gateArgs = {
        sessionId,
        tenantId,
        userId,
        prisma: tenantPrisma,
        projectId: gateProjectId,
      }
      // 链路一：招投标监测回答中出现明确我方中标表述 → evidence.bidResult 待确认条目
      if (intent.intent === 'bidding_monitor') {
        try {
          await captureBidResultFromChat({ ...gateArgs, assistantText })
        } catch (e) {
          chatLogger.warn({ err: e, projectId: gateProjectId }, 'bid_result extraction failed')
        }
      }
      // 链路二：讨论类对话（含项目上下文）中聊到的预算/报价/拍板人/需求指标 → gate 字段待确认条目
      if (intent.intent === 'visit_analysis' || intent.intent === 'general_chat') {
        try {
          await captureGateSignalsFromChat({
            ...gateArgs,
            userMessage: lastMessage.content,
            assistantText,
          })
        } catch (e) {
          chatLogger.warn({ err: e, projectId: gateProjectId }, 'gate signal extraction failed')
        }
      }
    }

    // 保存完整的助手回复内容到 Redis + DB（await 确保落盘，失败可感知）
    try {
      // 输出安全护栏扫描
      const guardResult = scanOutput(assistantText)
      if (!guardResult.passed) {
        chatLogger.warn(
          {
            severity: guardResult.severity,
            violations: guardResult.violations,
          },
          'Guardrail triggered',
        )
        // 对编造类触发，在保存前追加警告提示，避免用户误信
        if (guardResult.violations.some((v) => v.includes('编造') || v.includes('权限'))) {
          assistantText += '\n\n---\n⚠️ **AI 输出校验提示**：本回复可能包含未经验证的信息（如联系人、职位、金额等），请以 CRM 中的实际记录为准，必要时可要求我重新核实。'
        }
      }

      await agentMemory.appendMessage(sessionId, {
        role: 'assistant',
        content: assistantText,
        createdAt: new Date().toISOString(),
      })
      await tenantPrisma.chatMessage.create({
        data: {
          sessionId,
          tenantId,
          role: 'assistant',
          content: assistantText,
          createdAt: new Date(),
        },
      })
      await tenantPrisma.chatSession.update({
        where: { id: sessionId },
        data: {
          updatedAt: new Date(),
          messageCount: { increment: 1 },
        },
      })
    } catch (saveErr) {
      chatLogger.error({ err: saveErr }, 'Assistant message save failed')
    }
  } catch (err) {
    if (reply.sent) {
      chatLogger.error({ err }, 'Chat stream error after response sent')
      return
    }
    throw err
  }
}
