import type { FastifyRequest, FastifyReply } from 'fastify'
import { Prisma } from '@prisma/client'
import { generateText } from 'ai'
import { createModel } from '../config/model-provider.js'
import { getAIConfig } from '../config/ai-config.js'
import { z } from 'zod'
import { skillRegistry } from './skills/index.js'
import { AppError } from '../errors/app-error.js'
import { ErrorCode } from '../errors/error-codes.js'
import { traceLLMCall, logToolTrace } from '../infra/llm-trace.js'
import { getComponentLogger } from '../infra/logger.js'
import { llmConcurrencyLimiter } from '../infra/concurrency-limiter.js'

const logger = getComponentLogger('audit')
// ========== DynamicContextAgent 认知审计接口 ==========

const AuditRequestSchema = z.object({
  transcript: z.string().min(1).describe('销售口述的转写文本'),
  projectId: z.string().optional().describe('关联的商机项目ID'),
  customerId: z.string().optional().describe('关联的客户ID'),
  customerType: z.string().default('company').describe('客户类型'),
  audioUrl: z.string().optional().describe('原始音频URL（如有）'),
})

const AuditOutputSchema = z.object({
  summary: z.string().describe('审计摘要，包括人·事·财三维度分析'),
  toolCalls: z.array(z.object({
    name: z.enum(['projectStructuredLedger', 'raiseRiskAndPlanNBA']).describe('要调用的工具名'),
    arguments: z.record(z.unknown()).describe('工具入参'),
  })).describe('需要执行的工具调用列表。如果没有任何事实可落盘或缺失需补救，则留空数组'),
  nextActions: z.array(z.string()).describe('下一步行动建议'),
})

type AuditOutput = z.infer<typeof AuditOutputSchema>

/**
 * 将旧 Tool 名称映射为 Skill 调用
 * - projectStructuredLedger -> project-analysis.structuredLedger
 * - raiseRiskAndPlanNBA -> project-analysis.raiseRiskAndPlanNBA
 */
function mapAuditToolCallToSkill(
  name: string,
  arguments_: Record<string, unknown>,
): { skillId: string; params: Record<string, unknown> } {
  switch (name) {
    case 'projectStructuredLedger':
      return { skillId: 'project-analysis', params: { action: 'structuredLedger', ...arguments_ } }
    case 'raiseRiskAndPlanNBA':
      return { skillId: 'project-analysis', params: { action: 'raiseRiskAndPlanNBA', ...arguments_ } }
    default:
      return { skillId: name, params: arguments_ }
  }
}

/**
 * DynamicContextAgent 认知审计
 * 接收销售口述文本，基于SPIN规则审计，提取人·事·财要素
 * 通过结构化输出强制LLM生成工具调用，然后本地执行
 */
export async function audit(req: FastifyRequest, reply: FastifyReply) {
  const body = AuditRequestSchema.parse(req.body)
  const user = req.user as { id: string; tenantId: string; role: string; orgId?: string } | undefined
  const userId = user?.id || 'anonymous'
  const tenantId = user?.tenantId || 'default'
  const orgId = user?.orgId || ''

  const tenantPrisma = req.tenantPrisma
  if (!tenantPrisma) {
    throw new AppError(ErrorCode.AUTHORIZATION_ERROR, '租户上下文缺失', 403)
  }

  const aiConfig = getAIConfig()
  if (!aiConfig.openaiApiKey) {
    throw new AppError(ErrorCode.AI_SERVICE_ERROR, 'AI 模型未配置', 503)
  }

  const traceId = req.id || `audit_${Date.now()}`

  try {
    // 获取项目历史（用于上下文）
    let projectContext = ''
    if (body.projectId) {
      const project = await tenantPrisma.project.findUnique({
        where: { id: body.projectId },
        include: { company: { select: { name: true } } },
      })
      if (project) {
        projectContext = `\n【当前项目背景】\n项目名称：${project.name}\n客户：${project.company?.name || '-'}\n当前里程碑：M${project.milestone}\n健康度：${project.healthScore ?? '-'}\n`
      }
    }

    const system = `你是顶级项目型销售的"第二大脑"。你当前正在审计销售的口述复盘。

【任务】
从销售感性、零散、甚至带有口音黑话的口述中，无情地剥离出涉及"人、事、财"的底层事实。

【审计维度】
1. 人（HUMAN）：决策链、关键人态度、支持者/反对者、个人诉求
2. 事（BUSINESS）：显性需求、隐性痛点、里程碑进展、竞品动态
3. 财（FINANCE）：预算来源、预算金额、审批流程、决策周期

【执行规则 - 必须严格遵守】
- 如果口述中包含明确、可验证的进度事实（如"客户确认预算50万"、"处长说下周发招标文件"），你必须在 toolCalls 中调用 projectStructuredLedger 工具进行投影落盘。
- 如果口述中缺少关键维度信息（如只谈了需求没谈预算，或没确认决策人），你必须在 toolCalls 中调用 raiseRiskAndPlanNBA 工具生成补救计划。
- projectStructuredLedger 必须提供 evidenceSegment（原文片段）和 mutations（变更快照）。
- raiseRiskAndPlanNBA 必须提供 missingDimension（HUMAN/BUSINESS/FINANCE）和 nextBestActionPrompt（具体话术）。
- 如果没有任何明确事实可以落盘，也没有任何关键维度缺失，toolCalls 留空数组。

【可用工具】
1. projectStructuredLedger: 将确认的事实投影落盘到 TimelineEvent 和 Project
   参数示例：
   {
     "projectId": "${body.projectId || 'project_xxx'}",
     "summary": "客户确认50万预算并明确春季开课需求",
     "cognitivePayload": { "perceivedIntent": "积极推进", "hiddenObjection": "担心实施周期", "confidence": 0.9 },
     "mutations": { "milestone": 3, "healthScore": 80 },
     "evidenceSegment": "原文片段"
   }

2. raiseRiskAndPlanNBA: 当发现信息缺失时生成补救任务
   参数示例：
   {
     "projectId": "${body.projectId || 'project_xxx'}",
     "missingDimension": "FINANCE",
     "diagnosticRisk": "未确认预算审批人，可能导致项目停滞",
     "nextBestActionPrompt": "下次拜访时请确认财务处长是否参与审批",
     "suggestedDeadline": "2026-06-15T18:00:00.000Z"
   }

【类型要求】
- projectId 必须是字符串，当前项目ID为：${body.projectId || '未指定'}
- confidence 必须是 0-1 之间的数字，不要用字符串
- milestone 必须是 0-8 之间的整数，不要用字符串
- hiddenObjection 如果不确定可以省略，不要传 null
- missingDimension 只能是 HUMAN / BUSINESS / FINANCE 之一

【输出要求】
你必须输出严格符合以下 JSON Schema 的结果，不要输出任何其他内容：
{
  "summary": "审计摘要",
  "toolCalls": [{"name": "...", "arguments": {...}}],
  "nextActions": ["建议1", "建议2"]
}${projectContext}`

    const { result: llmResult } = await llmConcurrencyLimiter.run(userId, () =>
      traceLLMCall(
        {
          component: 'audit-analysis',
          model: aiConfig.modelName || 'unknown',
          provider: aiConfig.provider,
          traceId,
          userId,
          tenantId,
          orgId,
          projectId: body.projectId,
          customerId: body.customerId,
        },
        async () => {
          const r = await generateText({
            model: createModel() as any,
            system,
            prompt: body.transcript,
          })
          return {
            result: r,
            usage: {
              promptTokens: r.usage?.inputTokens,
              completionTokens: r.usage?.outputTokens,
              totalTokens: r.usage?.totalTokens,
            },
          }
        },
      ),
    )
    const { text } = llmResult

    // 解析 JSON 输出
    let auditOutput: AuditOutput
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? jsonMatch[0] : text
      auditOutput = AuditOutputSchema.parse(JSON.parse(jsonText))
    } catch (parseErr) {
      logger.warn(
        {
          traceId,
          userId,
          tenantId,
          projectId: body.projectId,
          rawOutputLength: text.length,
          err: parseErr,
        },
        'Failed to parse audit LLM output as JSON, falling back to raw text',
      )
      // 降级：将原始文本作为摘要返回
      auditOutput = {
        summary: text,
        toolCalls: [],
        nextActions: ['请检查AI输出格式'],
      }
    }

    // 执行工具调用（旧 Tool 名称映射到 Skill id + action）
    const toolResults: Array<{ name: string; result: unknown; error?: string }> = []
    for (const tc of auditOutput.toolCalls) {
      const toolStart = Date.now()
      const { skillId, params } = mapAuditToolCallToSkill(tc.name, tc.arguments)
      try {
        const skillResult = await skillRegistry.execute(skillId, params, {
          tenantId,
          userId,
          orgId,
          role: user?.role || 'SALES',
          prisma: tenantPrisma,
          traceId,
        })
        if (skillResult.success) {
          toolResults.push({ name: tc.name, result: skillResult.data })
          logToolTrace(logger, tc.name, Date.now() - toolStart, {
            userId,
            sessionId: traceId,
            input: tc.arguments,
            output: { success: true },
          })
        } else {
          const errorMessage = skillResult.error?.message || 'Skill execution failed'
          toolResults.push({ name: tc.name, result: null, error: errorMessage })
          logToolTrace(logger, tc.name, Date.now() - toolStart, {
            userId,
            sessionId: traceId,
            input: tc.arguments,
            error: errorMessage,
          })
        }
      } catch (err) {
        const durationMs = Date.now() - toolStart
        const errorMessage = (err as Error).message
        toolResults.push({ name: tc.name, result: null, error: errorMessage })
        logToolTrace(logger, tc.name, durationMs, {
          userId,
          sessionId: traceId,
          input: tc.arguments,
          error: errorMessage,
        })
      }
    }

    // 构建人类可读的回复
    const toolCallSummary = auditOutput.toolCalls.length > 0
      ? `\n\n### 工具调用\n${auditOutput.toolCalls.map((tc, i) => {
        const result = toolResults[i]
        const status = result.error ? `❌ 失败: ${result.error}` : '✅ 成功'
        return `- **${tc.name}**: ${status}`
      }).join('\n')}`
      : '\n\n### 工具调用\n本次审计未触发自动落盘工具。'

    const assistantText = `### 审计摘要\n\n${auditOutput.summary}${toolCallSummary}\n\n### 下一步行动\n${auditOutput.nextActions.map((a) => `- ${a}`).join('\n')}`

    // 保存审计结果到 TimelineEvent
    const timelineEvent = await tenantPrisma.timelineEvent.create({
      data: {
        tenantId,
        ownerId: userId,
        orgId,
        customerId: body.customerId || '',
        customerType: body.customerType,
        projectId: body.projectId || null,
        eventType: 'visit.voice_raw',
        eventSubtype: 'agent.audit',
        eventData: { transcript: body.transcript, audioUrl: body.audioUrl },
        cognitivePayload: {
          auditType: 'dynamic_context',
          toolCalls: auditOutput.toolCalls,
          toolResults: toolResults.map((r) => ({ name: r.name, success: !r.error })),
        } as unknown as Prisma.InputJsonValue,
        mutations: {},
        aiInsight: assistantText,
        sourceType: 'sales_voice',
        sourceLabel: 'DynamicContextAgent审计',
        transcriptUrl: body.audioUrl,
        eventTime: new Date(),
      },
    })

    // 流式返回
    reply.type('text/plain; charset=utf-8')
    const chunkSize = 20
    for (let i = 0; i < assistantText.length; i += chunkSize) {
      reply.raw.write(assistantText.slice(i, i + chunkSize))
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    reply.raw.end()

    logger.info(
      {
        traceId,
        userId,
        tenantId,
        timelineEventId: timelineEvent.id,
        toolCallCount: auditOutput.toolCalls.length,
      },
      'Audit completed and TimelineEvent created',
    )
  } catch (err) {
    if (reply.sent) {
      logger.error({ traceId, userId, tenantId, err }, 'Audit stream error after response sent')
      return
    }
    throw err
  }
}
