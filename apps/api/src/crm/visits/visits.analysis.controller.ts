import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { generateText } from 'ai'
import { createModel } from '../../config/model-provider.js'
import { llmConcurrencyLimiter } from '../../infra/concurrency-limiter.js'
import { z } from 'zod'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { refreshClosure, getRawInput } from './closure.service.js'
import { generatePrepMaterial } from './visit-prep.service.js'
import { createAutoAppliedItem } from '../confirmations/confirmations.service.js'
import { dedupeSimilar, filterSimilarTo } from '../../lib/text-dedupe.js'
import { ActivityEventType } from '../../lib/activity.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUserId(req: FastifyRequest): string {
  return (req.user as { id?: string } | undefined)?.id || 'anonymous'
}

const VisitAnalysisSchema = z.object({
  milestoneProgress: z.string().optional(),
  decisionChain: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
    attitude: z.string().optional(),
    insight: z.string().optional(),
  })).optional(),
  keyInfo: z.object({
    firstContact: z.string().optional(),
    budget: z.string().optional(),
    price: z.string().optional(),
    timeline: z.string().optional(),
    solution: z.string().optional(),
    competitors: z.array(z.string()).optional(),
    painPoints: z.array(z.string()).optional(),
  }).optional(),
  evidence: z.object({
    bidResult: z.string().optional(),
  }).optional(),
  risks: z.array(z.string()).optional(),
  nextActions: z.array(z.string()).optional(),
  sentiment: z.string().optional(),
})

export async function runVisitAnalysis(prisma: PrismaClient, visitId: string, userId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      project: {
        include: {
          company: true,
          contacts: { include: { contact: true } },
          visits: { take: 5, orderBy: { visitTime: 'desc' } },
        },
      },
    },
  })

  if (!visit) throw new Error('拜访记录不存在')

  // V6.1 Phase 3：分析源只认销售原始输入（rawInput/转写原文），不认 AI 扩写 summary
  const raw = getRawInput(visit)
  const content = raw.text
  if (!content.trim()) throw new Error('拜访记录无内容可分析')

  const project = visit.project
  const contextLines: string[] = []
  if (project) {
    contextLines.push(`项目: ${project.name}`)
    contextLines.push(`当前里程碑: M${project.milestone}`)
    if (project.company) contextLines.push(`客户: ${project.company.name}`)
    if (project.contacts?.length) {
      contextLines.push('已知联系人:')
      project.contacts.forEach((pc) => {
        const c = pc.contact
        contextLines.push(`  - ${c.name} (${c.position || '未知职位'}) [${pc.role || '未知角色'}]`)
      })
    }
    if (project.visits?.length > 1) {
      contextLines.push('近期拜访记录:')
      project.visits.slice(1).forEach((v) => {
        contextLines.push(`  - ${new Date(v.visitTime).toLocaleDateString('zh-CN')}: ${(v.summary || '').slice(0, 60)}`)
      })
    }
  }

  const prompt = `请作为销售分析专家，基于以下拜访记录和项目背景进行深度分析。

【项目背景】
${contextLines.join('\n') || '无'}

【本次拜访内容】
${content}

请输出以下维度的分析结果（JSON格式）：
1. milestoneProgress: 里程碑进展判断（如"从M2推进到M3，痛点已确认"）
2. decisionChain: 决策链洞察。必须提取拜访记录中提到的所有关键人物，包括：name（姓名/姓氏+职务，如"王主任"）、role（职务/角色，如"教务处处长"）、attitude（对项目态度：支持/中立/反对/未表态/犹豫）、insight（关键洞察/诉求/顾虑）。不要遗漏任何提到的人物。
3. keyInfo: 关键信息（firstContact首次接触方式如电话/拜访/引荐/展会, budget客户预算, price我方报价, timeline时间线, solution方案要点, competitors竞品, painPoints痛点）
4. evidence: 证据信息（bidResult中标结果或签约信息，如"已中标，金额128万"或"已签约"）
5. risks: 风险预警列表
6. nextActions: 下一步行动建议列表
7. sentiment: 整体情绪判断（积极/中性/消极）

【提取纪律】
- nextActions 最多 5 条，每条是一个独立动作；同一件事不得拆成多条或换角度重复（如"提交方案初稿"只保留一条最完整的）
- competitors/painPoints 只列名称或短语，同义词合并（"希沃"与"seewo希沃"只留一个）
- 只提取本次拜访中真实出现的信息，不确定的不要写

只返回合法JSON，不要markdown代码块。`

  const { text } = await llmConcurrencyLimiter.run(userId, () =>
    generateText({
      model: createModel() as unknown as Parameters<typeof generateText>[0]['model'],
      prompt,
      temperature: 0.3,
      maxOutputTokens: 3000,
    }),
  )

  let analysis: z.infer<typeof VisitAnalysisSchema> = {}
  try {
    const clean = text.replace(/^```json\s*|\s*```$/g, '').trim()
    analysis = VisitAnalysisSchema.parse(JSON.parse(clean))
  } catch {
    analysis = { milestoneProgress: text.slice(0, 500) }
  }

  // 兜底：如果 AI 没提取到中标结果，但原文有明显中标/签约表述，用正则补提
  if (!analysis.evidence?.bidResult?.trim()) {
    const bidMatch = content.match(/(?:我方|我们|本公司|公司)\s*(?:成功)?\s*(?:中标|中标金额|中标金额|签约|签署合同|合同金额)[：:]?\s*([^\n。；]+)/)
    if (bidMatch?.[1]) {
      analysis = {
        ...analysis,
        evidence: { ...(analysis.evidence || {}), bidResult: bidMatch[1].trim().slice(0, 200) },
      }
    }
  }

  // V6.1 节点4：AI 扩写摘要（summary 为空或过短时生成）——AI 产物，不参与评分
  let finalSummary = visit.summary
  if (!finalSummary || finalSummary.length < 50) {
    try {
      const { text: expanded } = await llmConcurrencyLimiter.run(userId, () =>
        generateText({
          model: createModel() as unknown as Parameters<typeof generateText>[0]['model'],
          prompt: `将以下拜访速记扩写成结构化摘要（200字以上，包含需求/预算/方案/时间/决策等要素）：\n${content}`,
          temperature: 0.3,
          maxOutputTokens: 1500,
        }),
      )
      finalSummary = expanded.trim()
    } catch {
      // 扩写失败不阻塞分析主流程，summary 维持原值
    }
  }

  // 写入数据库（summary 为 AI 扩写产物，与 rawInput 严格分离）
  await prisma.visit.update({
    where: { id: visitId },
    data: { aiAnalysis: analysis as never, summary: finalSummary },
  })

  // 【V6.1 Phase 3 核心变更】AI 提取产物默认进待确认队列，不直接落库为事实
  // 【V6.2 分级信任】诉求/竞品（低风险）自动生效+可撤销+去重；任务/预算/决策链（高风险）仍需人工确认
  // （旧逻辑直写 project.humanInfo/financeInfo/decisionMap + 直接 createTask ——
  //  转写错误/AI幻觉会污染数据，且违反《智能体数据写入治理规范》单一写入通道铁律。
  //  确认后的落库动作见 confirmations.service 的 applyConfirmedItem）
  let pendingItemsCreated = 0
  if (project) {
    const ownerId = visit.ownerId || ''
    const base = {
      tenantId: project.tenantId,
      ownerId,
      projectId: project.id,
      visitId: visit.id,
    }

    // V6.2 幂等重跑：重新分析前清掉该拜访上一批未处理的 pending（已确认/驳回/auto 的历史保留）
    // 否则每重跑一次就叠加一批重复条目（E2E 曾出现 26=13×2）
    await prisma.aiPendingItem.deleteMany({
      where: { tenantId: project.tenantId, visitId: visit.id, status: 'pending' },
    })

    if (analysis.nextActions?.length) {
      // 任务三级去重：① 本批内换角度复述合并；② 与库内未完成任务相似的不重复建议
      const openTasks = await prisma.task.findMany({
        where: { tenantId: project.tenantId, projectId: project.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        select: { title: true },
      })
      const freshActions = filterSimilarTo(
        dedupeSimilar(analysis.nextActions),
        openTasks.map((t) => t.title),
      )
      for (const action of freshActions) {
        await prisma.aiPendingItem.create({
          data: {
            ...base,
            itemType: 'task',
            itemData: {
              title: action,
              description: `来自拜访分析（${new Date(visit.visitTime).toLocaleDateString('zh-CN')}）的下一步行动建议`,
              priority: 'HIGH',
              deadline: (visit.nextActionDeadline || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)).toISOString(),
            },
          },
        })
        pendingItemsCreated++
      }
    }

    if (analysis.keyInfo?.budget) {
      await prisma.aiPendingItem.create({
        data: { ...base, itemType: 'budget_signal', itemData: { content: analysis.keyInfo.budget } },
      })
      pendingItemsCreated++
    }

    // V6.2 分级信任：诉求/竞品为低风险信息 → 自动生效（可撤销），且与档案已有内容去重，
    // 不再占用人工确认队列（人工把关保留给 任务/预算/决策链 三类）
    const knownPains = Array.isArray((project.humanInfo as Record<string, unknown>)?.painPoints)
      ? ((project.humanInfo as Record<string, unknown>).painPoints as unknown[])
      : []
    const knownCompetitors = Array.isArray((project.businessInfo as Record<string, unknown>)?.competitors)
      ? ((project.businessInfo as Record<string, unknown>).competitors as unknown[])
      : []
    let knownFirstContact = (project.humanInfo as Record<string, unknown>)?.firstContact
    let knownSolution = (project.businessInfo as Record<string, unknown>)?.solution
    let knownPrice = (project.financeInfo as Record<string, unknown>)?.price
    let knownBidResult = (project.evidence as Record<string, unknown>)?.bidResult

    if (analysis.keyInfo?.firstContact?.trim() && !knownFirstContact) {
      await createAutoAppliedItem(prisma, {
        ...base,
        itemType: 'first_contact',
        itemData: { content: analysis.keyInfo.firstContact.trim() },
      })
      knownFirstContact = analysis.keyInfo.firstContact.trim()
      pendingItemsCreated++
    }

    if (analysis.keyInfo?.solution?.trim() && !knownSolution) {
      await createAutoAppliedItem(prisma, {
        ...base,
        itemType: 'solution_summary',
        itemData: { content: analysis.keyInfo.solution.trim() },
      })
      knownSolution = analysis.keyInfo.solution.trim()
      pendingItemsCreated++
    }

    if (analysis.keyInfo?.price?.trim() && !knownPrice) {
      await createAutoAppliedItem(prisma, {
        ...base,
        itemType: 'price_quote',
        itemData: { content: analysis.keyInfo.price.trim() },
      })
      knownPrice = analysis.keyInfo.price.trim()
      pendingItemsCreated++
    }

    if (analysis.evidence?.bidResult?.trim() && !knownBidResult) {
      await createAutoAppliedItem(prisma, {
        ...base,
        itemType: 'bid_result',
        itemData: { content: analysis.evidence.bidResult.trim() },
      })
      knownBidResult = analysis.evidence.bidResult.trim()
      pendingItemsCreated++
    }

    if (analysis.keyInfo?.painPoints?.length) {
      for (const pain of analysis.keyInfo.painPoints) {
        if (!pain || knownPains.includes(pain)) continue
        await createAutoAppliedItem(prisma, {
          ...base,
          itemType: 'key_request',
          itemData: { content: pain },
        })
        knownPains.push(pain)
        pendingItemsCreated++
      }
    }

    if (analysis.keyInfo?.competitors?.length) {
      for (const comp of analysis.keyInfo.competitors) {
        if (!comp || knownCompetitors.includes(comp)) continue
        await createAutoAppliedItem(prisma, {
          ...base,
          itemType: 'competitor_mention',
          itemData: { content: comp },
        })
        knownCompetitors.push(comp)
        pendingItemsCreated++
      }
    }

    const existingDecisionMap = (project.decisionMap as Record<string, unknown>) || {}
    const existingDecisionNodes = Array.isArray(existingDecisionMap.nodes) ? (existingDecisionMap.nodes as unknown[]) : []

    if (analysis.decisionChain?.length && existingDecisionNodes.length === 0) {
      await createAutoAppliedItem(prisma, {
        ...base,
        itemType: 'decision_chain',
        itemData: { chain: analysis.decisionChain },
      })
      pendingItemsCreated++
    }
  }

  if (project) {
    await recordTimelineEvent(prisma, {
      tenantId: project.tenantId,
      customerId: project.companyId || '',
      projectId: project.id,
      eventType: ActivityEventType.VISIT_AI_ANALYZED,
      eventData: {
        visitId,
        summary: analysis.milestoneProgress,
        pendingItemsCreated,
      },
      // V6.1：AI 分析产物待人工确认后才作为事实沉淀
      factStatus: 'pending_confirmation',
      sourceType: 'ai',
      sourceId: userId,
      sourceLabel: 'AI 拜访分析',
      eventTime: new Date(),
    })

    // V6.1：分析完成后刷新闭环状态（6 节点规则；has_confirmation 由待确认队列剩余量推导）
    await refreshClosure(prisma, visitId, { actorUserId: userId })
  }

  return { visit, analysis, pendingItemsCreated }
}

// V6.1：computeClosureFactors 已迁移至 closure.service.ts（computeClosureFlags + computeBehaviorScore）
// 旧的 5×20 布尔计分（含按 AI 产物 summary 计分的自我循环漏洞）已废弃

export async function analyzeVisit(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const { id } = req.params
    const userId = getUserId(req)
    const { analysis } = await runVisitAnalysis(prisma, id, userId)
    reply.send({ success: true, data: analysis })
  } catch (err) {
    const msg = (err as Error).message
    if (msg === '拜访记录不存在') return reply.status(404).send({ success: false, error: msg })
    if (msg === '拜访记录无内容可分析') return reply.status(400).send({ success: false, error: msg })
    reply.status(500).send({ success: false, error: msg })
  }
}

const PrepVisitSchema = z.object({ projectId: z.string() })

export async function prep(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const { projectId } = PrepVisitSchema.parse(req.body)
    const userId = getUserId(req)
    const tenantId = (req.user as { tenantId?: string } | undefined)?.tenantId || ''

    // Phase 3：准备素材生成收口到 visit-prep.service（HTTP 手动触发与队列自动触发共用）
    const data = await generatePrepMaterial(prisma, { tenantId, projectId, userId })
    reply.send({ success: true, data })
  } catch (err) {
    const msg = (err as Error).message
    if (msg === '商机不存在') return reply.status(404).send({ success: false, error: msg })
    reply.status(500).send({ success: false, error: msg })
  }
}

export async function getClosure(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const { id } = req.params
    const user = req.user as { id: string } | undefined

    // V6.1：闭环计算收口到 closure.service（6 节点规则 + A 轨行为分）
    const closure = await refreshClosure(prisma, id, { actorUserId: user?.id })
    reply.send({ success: true, data: closure })
  } catch (err) {
    const msg = (err as Error).message
    if (msg === '拜访记录不存在') return reply.status(404).send({ success: false, error: msg })
    reply.status(500).send({ success: false, error: msg })
  }
}

export async function close(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const { id } = req.params
    const userId = getUserId(req)

    const visit = await prisma.visit.findUnique({ where: { id } })
    if (!visit) return reply.status(404).send({ success: false, error: '拜访记录不存在' })

    const { analysis, pendingItemsCreated } = await runVisitAnalysis(prisma, id, userId)

    // V6.1：闭环状态由 closure.service 统一计算（6 节点全完成才打 closedAt）
    const closure = await refreshClosure(prisma, id, { actorUserId: userId })

    await prisma.visit.update({ where: { id }, data: { workflowStage: 'CLOSED' } })

    reply.send({
      success: true,
      data: { analysis, closure, pendingItemsCreated },
    })
  } catch (err) {
    const msg = (err as Error).message
    if (msg === '拜访记录不存在') return reply.status(404).send({ success: false, error: msg })
    if (msg === '拜访记录无内容可分析') return reply.status(400).send({ success: false, error: msg })
    reply.status(500).send({ success: false, error: msg })
  }
}

export async function copilotStream(req: FastifyRequest, reply: FastifyReply) {
  const { transcript, projectId } = req.body as { transcript?: string; projectId?: string }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  if (!transcript || transcript.length < 30) {
    reply.raw.write(`data: ${JSON.stringify({ type: 'noop', content: '内容过短' })}\n\n`)
    reply.raw.write('data: [DONE]\n\n')
    reply.raw.end()
    return
  }

  try {
    let context = ''
    if (projectId) {
      const prisma = getPrisma(req)
      const project = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        include: { company: true },
      })
      if (project) {
        context = `项目: ${project.name} | 客户: ${project.company?.name || '未知'} | 阶段: M${project.milestone}`
      }
    }

    const prompt = `作为销售实时助手，基于以下拜访转写内容，提取关键洞察。
严格输出JSON数组格式，不要markdown代码块：
[{"type":"keyPoint","content":"..."},{"type":"riskAlert","content":"..."},{"type":"suggestion","content":"..."}]

【项目背景】${context || '无'}

【转写内容】${transcript}

只返回JSON数组。`

    const userId = getUserId(req)
    const { text } = await llmConcurrencyLimiter.run(userId, () =>
      generateText({
        model: createModel() as unknown as Parameters<typeof generateText>[0]['model'],
        prompt,
        temperature: 0.3,
        maxOutputTokens: 1500,
      }),
    )

    let items: Array<{ type: string; content: string }> = []
    try {
      const clean = text.replace(/^```json\s*|\s*```$/g, '').trim()
      items = JSON.parse(clean)
      if (!Array.isArray(items)) items = []
    } catch {
      items = [{ type: 'keyPoint', content: text.slice(0, 300) }]
    }

    for (const item of items) {
      reply.raw.write(`data: ${JSON.stringify(item)}\n\n`)
    }
    reply.raw.write('data: [DONE]\n\n')
    reply.raw.end()
  } catch (err) {
    reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: (err as Error).message })}\n\n`)
    reply.raw.write('data: [DONE]\n\n')
    reply.raw.end()
  }
}
