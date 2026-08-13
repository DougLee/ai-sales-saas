import type { PrismaClient } from '@prisma/client'
import { logger } from '../../infra/logger.js'

/**
 * 拜访闭环服务（V6.1 §5.3 / §6.1）
 *
 * 设计红线：评分只衡量销售的行为与获取的信息，不衡量 AI 的输出。
 * - 行为分（A 轨，0-60）只读 visits.rawInput（原始输入）与可验证行为事实
 * - AI 扩写产物（summary 的 AI 生成部分、aiAnalysis）不作为计分输入
 * - rubric 分（B 轨，0-40）Phase 4 接入 LLM，本阶段 rubricScore 留 null
 */

/** A 轨关键词：只在销售原始输入上统计（销售自己写到的才算） */
const RAW_DOC_KEYWORDS = ['需求', '预算', '方案', '时间', '决策', '痛点', '下一步', '竞争']

interface VisitLike {
  summary?: string | null
  rawInput?: string | null
  rawInputType?: string | null
  audioUrl?: string | null
  audioTranscript?: string | null
  aiAnalysis?: unknown
  nextActionDeadline?: Date | null
  extractedTasks?: unknown
  attachments?: unknown
  milestoneChanged?: boolean | null
}

/**
 * 取销售的原始输入（评分唯一依据）。
 * 回退链：rawInput → audioTranscript
 *
 * Phase 3 起 summary 为 AI 扩写产物（与销售输入分字段存储），
 * 不再进入本回退链——评分只认销售的原始记录，不认 AI 的文字。
 */
export function getRawInput(visit: VisitLike): { text: string; type: string | null } {
  if (visit.rawInput && visit.rawInput.trim()) {
    return { text: visit.rawInput, type: visit.rawInputType || 'note' }
  }
  if (visit.audioTranscript && visit.audioTranscript.trim()) {
    return { text: visit.audioTranscript, type: 'transcript' }
  }
  return { text: '', type: null }
}

export interface ClosureFlags {
  hasPreparation: boolean
  hasRecording: boolean
  hasSummary: boolean
  hasAiAnalysis: boolean
  hasFollowUp: boolean
  hasConfirmation: boolean
}

export interface BehaviorScoreResult {
  behaviorScore: number
  dimensions: {
    preparation: number
    rawDocumentation: number
    followUp: number
    progression: number
  }
}

/**
 * A 轨行为分（0-60，纯规则，确定可复现）
 * 验收红线：AI 扩写摘要的任何变化不影响本分数
 */
export function computeBehaviorScore(visit: VisitLike, flags: ClosureFlags): BehaviorScoreResult {
  const raw = getRawInput(visit)

  // 原始记录完整度（20分）——只看 raw input，不看 AI 扩写摘要
  let rawDocumentation = 0
  if (flags.hasRecording) rawDocumentation += 8 // 有记录行为本身
  if (raw.text.length >= 100) rawDocumentation += 6 // 原始输入有实质内容
  if (raw.text.length >= 300) rawDocumentation += 3
  const hits = RAW_DOC_KEYWORDS.filter((k) => raw.text.includes(k)).length
  rawDocumentation += Math.min(3, hits)

  const dimensions = {
    preparation: flags.hasPreparation ? 15 : 0,
    rawDocumentation,
    followUp: (flags.hasFollowUp ? 8 : 0) + (flags.hasConfirmation ? 7 : 0),
    progression: visit.milestoneChanged ? 10 : 0,
  }

  return {
    behaviorScore: Object.values(dimensions).reduce((a, b) => a + b, 0),
    dimensions,
  }
}

/**
 * 计算一次拜访的闭环状态（6 节点）
 * hasConfirmation 不由 visit 推导，需调用方传入（该拜访无待确认 AI 产物时为 true）
 */
export function computeClosureFlags(visit: VisitLike, hasConfirmation: boolean): ClosureFlags {
  const raw = getRawInput(visit)
  return {
    // Phase 3：准备节点认 visit-prep.service 生成的准备素材（attachments type='visit_prep'），
    // 不再从 summary 文本猜测（summary 已是 AI 扩写产物）
    hasPreparation: !!(
      (visit.attachments as Array<Record<string, unknown>> | undefined)?.some(
        (a) => a.type === 'visit_prep',
      )
    ),
    hasRecording: !!(visit.audioUrl || raw.text),
    hasSummary: !!(visit.summary && visit.summary.length > 20),
    hasAiAnalysis: !!(
      visit.aiAnalysis && Object.keys(visit.aiAnalysis as Record<string, unknown>).length > 0
    ),
    hasFollowUp: !!(
      visit.nextActionDeadline ||
      (visit.extractedTasks as Array<unknown> | undefined)?.length
    ),
    hasConfirmation,
  }
}

function allClosed(flags: ClosureFlags): boolean {
  return (
    flags.hasPreparation &&
    flags.hasRecording &&
    flags.hasSummary &&
    flags.hasAiAnalysis &&
    flags.hasFollowUp &&
    flags.hasConfirmation
  )
}

/**
 * 创建拜访时初始化闭环记录（V6.1 §九 Phase 3：visit_closures 表初始化）
 * 全部节点未完成、不打分；后续由 refreshClosure 随节点推进刷新
 */
export async function initClosure(
  prisma: PrismaClient,
  opts: { visitId: string; projectId?: string | null; ownerId: string },
) {
  return prisma.visitClosure.upsert({
    where: { visitId: opts.visitId },
    create: {
      visitId: opts.visitId,
      projectId: opts.projectId || null,
      ownerId: opts.ownerId,
    },
    update: {},
  })
}

/**
 * 刷新拜访闭环记录（唯一写入口）
 *
 * - 闭环判定：6 节点全部完成才打 closedAt（替代旧的 qualityScore>=80 规则）
 * - 积分写入：仅在闭环完成时 behaviorLog.upsert 一次（唯一索引幂等），
 *   杜绝 V6.0 设计中的"每次节点更新重复写积分"放大问题
 */
export async function refreshClosure(
  prisma: PrismaClient,
  visitId: string,
  opts: { actorUserId?: string } = {},
) {
  const visit = await prisma.visit.findUnique({ where: { id: visitId } })
  if (!visit) throw new Error('拜访记录不存在')

  // 确认态：该拜访无 pending 的 AI 提取产物 → 视为已确认（无需确认的内容不阻塞闭环）
  const pendingCount = await prisma.aiPendingItem.count({
    where: { tenantId: visit.tenantId, visitId, status: 'pending' },
  })
  const hasConfirmation = pendingCount === 0

  const flags = computeClosureFlags(visit, hasConfirmation)

  // Phase 3：跟进节点认"有下一步行动"——AI 提取的待办在待确认队列里也算（确认动作由 hasConfirmation 节点管）
  if (!flags.hasFollowUp) {
    const pendingTasks = await prisma.aiPendingItem.count({
      where: { tenantId: visit.tenantId, visitId, itemType: 'task', status: { in: ['pending', 'confirmed', 'modified'] } },
    })
    if (pendingTasks > 0) flags.hasFollowUp = true
  }
  const { behaviorScore, dimensions } = computeBehaviorScore(visit, flags)

  const existing = await prisma.visitClosure.findUnique({ where: { visitId } })
  const shouldClose = allClosed(flags) && !existing?.closedAt

  // 已评出的 rubric 分在后续刷新中保留其贡献（否则 GET closure 触发的刷新会把 qualityScore 打回纯行为分）
  const carriedRubricWeighted =
    !shouldClose && existing?.rubricScore != null ? Math.round(existing.rubricScore * 0.4) : 0

  // qualityScore = 行为分(0-60) + rubric折算分(0-40)；rubric 在闭环打戳时触发（见下）
  let qualityScore = behaviorScore + carriedRubricWeighted

  const data = {
    projectId: visit.projectId,
    ownerId: opts.actorUserId || visit.ownerId,
    ...flags,
    qualityScore,
    qualityFactors: { ...dimensions, rubricWeighted: carriedRubricWeighted } as never,
    ...(shouldClose ? { closedAt: new Date() } : {}),
  }

  const closure = existing
    ? await prisma.visitClosure.update({ where: { visitId }, data })
    : await prisma.visitClosure.create({ data: { visitId, ...data } })

  // 闭环完成 → B 轨 rubric 评分 + 积分只写一次（upsert 幂等）
  if (shouldClose) {
    // B 轨：LLM rubric 评信息增量（输入只含 rawInput + 已确认时间轴，fail-soft 不阻塞闭环）
    try {
      const { scoreVisitWithRubric } = await import('./rubric.service.js')
      const rubricScore = await scoreVisitWithRubric(prisma, { visitId, userId: closure.ownerId })
      if (rubricScore != null) {
        const rubricWeighted = Math.round(rubricScore * 0.4)
        qualityScore = behaviorScore + rubricWeighted
        await prisma.visitClosure.update({
          where: { visitId },
          data: {
            qualityScore,
            qualityFactors: { ...dimensions, rubricWeighted } as never,
          },
        })
      }
    } catch (err) {
      logger.warn({ err, visitId }, 'rubric scoring failed (non-blocking)')
    }

    try {
      await prisma.behaviorLog.upsert({
        where: {
          unique_visit_closure_log: {
            tenantId: visit.tenantId,
            userId: closure.ownerId,
            visitId,
            type: 'visit_closure',
          },
        },
        create: {
          tenantId: visit.tenantId,
          userId: closure.ownerId,
          type: 'visit_closure',
          projectId: closure.projectId,
          visitId,
          score: qualityScore,
          description: `拜访闭环质量分: ${qualityScore}`,
        },
        update: {
          score: qualityScore,
          description: `拜访闭环质量分: ${qualityScore}`,
        },
      })
    } catch (err) {
      logger.error({ err, visitId }, 'behaviorLog upsert failed')
    }

    // V6.1 §7.2：有效跟进（闭环且质量分达标）即时重置项目停滞状态
    if (closure.projectId && qualityScore >= (await getEffectiveMinScore(prisma, visit.tenantId, closure.projectId))) {
      await prisma.project.updateMany({
        where: { id: closure.projectId, isStale: true },
        data: { isStale: false, staleSince: null, staleReason: null },
      })
    }
  }

  return closure
}

/** 读取项目所属类型档位的有效跟进最低质量分（无配置回退 40） */
async function getEffectiveMinScore(prisma: PrismaClient, tenantId: string, projectId: string): Promise<number> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { projectType: true } })
  if (!project) return 40
  const config = await prisma.projectTypeConfig.findUnique({
    where: { tenantId_typeKey: { tenantId, typeKey: project.projectType } },
    select: { effectiveFollowupMinScore: true },
  })
  return config?.effectiveFollowupMinScore ?? 40
}

/**
 * 项目最近一次"有效跟进"时间（V6.1 §7.2 停滞判定依据）
 * 有效跟进 = 已闭环 且 质量分 ≥ minScore 的拜访
 */
export async function getLastEffectiveFollowUp(
  prisma: PrismaClient,
  opts: { tenantId: string; projectId: string; minScore?: number },
) {
  const minScore = opts.minScore ?? 40
  const last = await prisma.visitClosure.findFirst({
    where: {
      projectId: opts.projectId,
      closedAt: { not: null },
      qualityScore: { gte: minScore },
      visit: { tenantId: opts.tenantId },
    },
    orderBy: { closedAt: 'desc' },
    select: { closedAt: true },
  })
  return last?.closedAt || null
}
