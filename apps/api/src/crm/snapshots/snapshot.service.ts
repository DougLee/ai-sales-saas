import type { PrismaClient } from '@prisma/client'
import { getEventsSince, getTimeline } from '../../lib/timeline.js'
import { logger } from '../../infra/logger.js'

/**
 * 客户/项目快照服务（V6.1 §4.2）
 *
 * 增量生成策略：
 * - 首次（无 coversUntil）：90 天全量已确认事件（limit 200），按类型聚类压缩喂 LLM
 * - 后续：上次 coversUntil 之后的增量事件 + 上次三层摘要（周/月/季度）作为"记忆"
 *
 * 设计红线：
 * - 只读取 factStatus='confirmed' 事件（V6.1 确认态隔离）
 * - coversUntil 在 save 时取 new Date()，落库后再赋值，避免同一时刻并发覆盖
 */

const FULL_HISTORY_DAYS = 90
const FULL_HISTORY_LIMIT = 200
const INCREMENTAL_LIMIT = 80
const SNAPSHOT_TTL_HOURS = 24

export interface ParsedSnapshot {
  weeklySummary: string
  monthlySummary: string
  quarterlyView: string
  healthScore: number
  riskFlags: Array<{ type: string; severity: 'high' | 'medium' | 'low'; description: string }>
  nextActions: Array<{ action: string; priority: 'high' | 'medium' | 'low'; expectedImpact: string }>
}

export interface SnapshotContext {
  projectId: string
  projectName: string
  companyName: string | null
  ownerName: string | null
  currentStage: number | null
  daysInStage: number | null
  incremental: boolean
  previousLayers?: {
    weeklySummary: string | null
    monthlySummary: string | null
    quarterlyView: string | null
    healthScore: number | null
  }
  events: Array<{
    eventType: string
    eventTime: Date
    aiInsight: string | null
    summary: string
  }>
  closureStats: {
    closed: number
    open: number
    pendingConfirm: number
  }
  /** Token 估算（增量上下文全量字符 / 4），用于验收「第二次快照 < 首次 40%」 */
  estimatedTokens: number
}

/**
 * 简易 token 估算（中文/英文混合约每 4 字符 1 token）
 * 验收用即可；生产可换 tiktoken
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/**
 * 加载项目最近一次快照（含 coversUntil）
 */
export async function getLatestSnapshot(prisma: PrismaClient, projectId: string) {
  return prisma.customerSnapshot.findFirst({
    where: { projectId },
    orderBy: { generatedAt: 'desc' },
  })
}

/**
 * 构造快照上下文（增量 vs 全量）
 */
export async function loadSnapshotContext(
  prisma: PrismaClient,
  opts: { tenantId: string; projectId: string }
): Promise<SnapshotContext> {
  const project = await prisma.project.findFirst({
    where: { id: opts.projectId, tenantId: opts.tenantId },
    select: {
      id: true,
      name: true,
      milestone: true,
      createdAt: true,
      company: { select: { name: true } },
      owner: { select: { name: true } },
    },
  })
  if (!project) {
    throw new Error(`Project not found: ${opts.projectId}`)
  }

  const previous = await getLatestSnapshot(prisma, project.id)
  let incremental = false
  let previousLayers: SnapshotContext['previousLayers'] | undefined
  let events: SnapshotContext['events']

  if (previous?.coversUntil) {
    incremental = true
    previousLayers = {
      weeklySummary: previous.weeklySummary,
      monthlySummary: previous.monthlySummary,
      quarterlyView: previous.quarterlyView,
      healthScore: previous.healthScore,
    }
    const raw = await getEventsSince(prisma, {
      tenantId: opts.tenantId,
      projectId: project.id,
      since: previous.coversUntil,
      limit: INCREMENTAL_LIMIT,
    })
    events = raw.map((e) => ({
      eventType: e.eventType,
      eventTime: e.eventTime,
      aiInsight: e.aiInsight,
      summary: summarizeEventData(e.eventData as Record<string, unknown> | null),
    }))
  } else {
    const since = new Date(Date.now() - FULL_HISTORY_DAYS * 86400000)
    const { items } = await getTimeline(prisma, {
      tenantId: opts.tenantId,
      projectId: project.id,
      startTime: since,
      limit: FULL_HISTORY_LIMIT,
    })
    events = items.map((e) => ({
      eventType: e.eventType,
      eventTime: e.eventTime,
      aiInsight: e.aiInsight,
      summary: summarizeEventData(e.eventData as Record<string, unknown> | null),
    }))
  }

  // 闭环统计：闭合 / 未闭 / 待确认
  const [closed, openAll] = await Promise.all([
    prisma.visitClosure.count({
      where: { projectId: project.id, closedAt: { not: null } },
    }),
    prisma.visitClosure.findMany({
      where: { projectId: project.id, closedAt: null },
      select: { hasAiAnalysis: true, hasConfirmation: true },
    }),
  ])
  const pendingConfirm = openAll.filter((v) => v.hasAiAnalysis && !v.hasConfirmation).length

  // 阶段停留天数（粗算：用最近一次里程碑推进事件或项目创建时间）
  const lastMilestoneEvent = await prisma.timelineEvent.findFirst({
    where: { tenantId: opts.tenantId, projectId: project.id, eventType: 'milestone.advanced' },
    orderBy: { eventTime: 'desc' },
    select: { eventTime: true },
  })
  const stageEntry = lastMilestoneEvent?.eventTime || project.createdAt
  const daysInStage = Math.floor((Date.now() - new Date(stageEntry).getTime()) / 86400000)

  const estimatedTokens = estimateTokens(
    JSON.stringify({ previousLayers, events }),
  )

  return {
    projectId: project.id,
    projectName: project.name,
    companyName: project.company?.name ?? null,
    ownerName: project.owner?.name ?? null,
    currentStage: project.milestone,
    daysInStage,
    incremental,
    previousLayers,
    events,
    closureStats: {
      closed,
      open: openAll.length,
      pendingConfirm,
    },
    estimatedTokens,
  }
}

/**
 * 压缩单条事件 eventData 为摘要字符串（喂 LLM 用）
 */
function summarizeEventData(data: Record<string, unknown> | null): string {
  if (!data) return ''
  // 优先用 aiInsight，其次取关键字段拼接
  const parts: string[] = []
  for (const key of ['name', 'title', 'reason', 'stage', 'milestone', 'description', 'message', 'suggestion']) {
    const v = data[key]
    if (typeof v === 'string' && v) parts.push(`${key}=${v}`)
    else if (typeof v === 'number') parts.push(`${key}=${v}`)
  }
  return parts.join('; ') || JSON.stringify(data).slice(0, 200)
}

/**
 * 持久化快照（coversUntil 设为 now，覆盖由调用方控制）
 */
export async function saveSnapshot(
  prisma: PrismaClient,
  input: {
    tenantId: string
    customerId: string | null
    projectId: string
    parsed: ParsedSnapshot
    currentStage: number | null
    stageDuration: number | null
    generatedBy: string
    incremental: boolean
    estimatedTokens: number
  }
) {
  const now = new Date()
  return prisma.customerSnapshot.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId || '',
      projectId: input.projectId,
      weeklySummary: input.parsed.weeklySummary,
      monthlySummary: input.parsed.monthlySummary,
      quarterlyView: input.parsed.quarterlyView,
      currentStage: input.currentStage?.toString() ?? null,
      stageDuration: input.stageDuration,
      healthScore: input.parsed.healthScore,
      riskFlags: input.parsed.riskFlags as never,
      nextActions: input.parsed.nextActions as never,
      generatedBy: input.generatedBy,
      generatedAt: now,
      expiresAt: new Date(now.getTime() + SNAPSHOT_TTL_HOURS * 3600000),
      coversUntil: now,
    },
  })
}

/**
 * 取项目最新有效快照（未过期优先，过期则返回 last regardless）
 */
export async function getEffectiveSnapshot(prisma: PrismaClient, projectId: string) {
  const now = new Date()
  const fresh = await prisma.customerSnapshot.findFirst({
    where: { projectId, expiresAt: { gt: now } },
    orderBy: { generatedAt: 'desc' },
  })
  if (fresh) return { snapshot: fresh, stale: false }
  const last = await prisma.customerSnapshot.findFirst({
    where: { projectId },
    orderBy: { generatedAt: 'desc' },
  })
  return { snapshot: last, stale: !!last }
}

/**
 * 渲染全量快照 prompt（V6.1 §4.3 SNAPSHOT_PROMPT）
 */
export function renderFullSnapshotPrompt(ctx: SnapshotContext): string {
  const eventLines = ctx.events
    .slice(0, 50)
    .map((e) => `- ${e.eventTime.toISOString().slice(0, 10)} [${e.eventType}] ${e.aiInsight || e.summary}`)
    .join('\n')

  return `你是一位资深的销售总监，正在审阅一个客户的跟进档案。请生成客户状态快照。

【输出格式要求】（严格 JSON，可被解析）
{
  "weeklySummary": "周摘要（≤50字）：近7天关键动态",
  "monthlySummary": "月摘要（≤100字）：近30天关系演进、阶段变化",
  "quarterlyView": "季度视图（≤150字）：关键决策点、关系网络变化、竞争态势",
  "healthScore": 0-100 的整数,
  "riskFlags": [{"type": "...", "severity": "high|medium|low", "description": "..."}],
  "nextActions": [{"action": "...", "priority": "high|medium|low", "expectedImpact": "..."}]
}

【输入信息】
项目：${ctx.projectName} | 客户：${ctx.companyName || '未知'} | 阶段：M${ctx.currentStage ?? '?'} | 已停留 ${ctx.daysInStage ?? '?'} 天 | 负责人：${ctx.ownerName || '未知'}
闭环统计：已闭环 ${ctx.closureStats.closed} 次 / 未闭环 ${ctx.closureStats.open} 次 / 待确认 ${ctx.closureStats.pendingConfirm} 条

近 90 天已确认时间轴事件（按时间倒序）：
${eventLines || '（暂无事件）'}

只输出 JSON，不要任何额外解释。`
}

/**
 * 渲染增量快照 prompt（V6.1 §4.3 INCREMENTAL_SNAPSHOT_PROMPT）
 */
export function renderIncrementalSnapshotPrompt(ctx: SnapshotContext): string {
  const eventLines = ctx.events
    .map((e) => `- ${e.eventTime.toISOString().slice(0, 10)} [${e.eventType}] ${e.aiInsight || e.summary}`)
    .join('\n')

  return `你是一位资深的销售总监，正在更新一个客户的跟进档案。
你已有一份此前的状态快照，现在补充了新的跟进事件。请演进式地更新快照：
- 保留仍然有效的判断，修正被新信息推翻的判断
- 周摘要总是重写（反映最新 7 天）
- 月摘要和季度视图做增量演进；如无实质变化可沿用原文
- 健康度根据新事件重新评估

【上次快照】
周摘要：${ctx.previousLayers?.weeklySummary || ''}
月摘要：${ctx.previousLayers?.monthlySummary || ''}
季度视图：${ctx.previousLayers?.quarterlyView || ''}
健康度：${ctx.previousLayers?.healthScore ?? '?'}

【自上次快照以来的新事件】（按时间正序，仅含已确认事件）：
${eventLines || '（暂无新事件）'}

【最近闭环统计】
已闭环 ${ctx.closureStats.closed} 次 / 未闭环 ${ctx.closureStats.open} 次 / 待确认 ${ctx.closureStats.pendingConfirm} 条

【输出格式】（严格 JSON，可被解析）
{
  "weeklySummary": "...",
  "monthlySummary": "...",
  "quarterlyView": "...",
  "healthScore": 0-100,
  "riskFlags": [...],
  "nextActions": [...]
}

只输出 JSON，不要任何额外解释。`
}

/**
 * 容错解析 LLM 输出（可能含 ```json 包裹）
 */
export function parseSnapshotResponse(raw: string): ParsedSnapshot {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    logger.warn({ err: (err as Error).message, raw: text.slice(0, 200) }, 'snapshot: parse failed, fallback')
    // 降级：构造最小合法结构
    return {
      weeklySummary: text.slice(0, 80) || '（LLM 输出无法解析）',
      monthlySummary: '',
      quarterlyView: '',
      healthScore: 60,
      riskFlags: [],
      nextActions: [],
    }
  }
  const p = parsed as Partial<ParsedSnapshot>
  return {
    weeklySummary: String(p.weeklySummary || '').slice(0, 200),
    monthlySummary: String(p.monthlySummary || '').slice(0, 400),
    quarterlyView: String(p.quarterlyView || '').slice(0, 600),
    healthScore: clampInt(p.healthScore, 0, 100),
    riskFlags: Array.isArray(p.riskFlags)
      ? (p.riskFlags as ParsedSnapshot['riskFlags']).slice(0, 10).map((r) => ({
          type: String(r.type || 'unknown').slice(0, 50),
          severity: (['high', 'medium', 'low'] as const).includes(r.severity as 'high')
            ? (r.severity as 'high' | 'medium' | 'low')
            : 'low',
          description: String(r.description || '').slice(0, 200),
        }))
      : [],
    nextActions: Array.isArray(p.nextActions)
      ? (p.nextActions as ParsedSnapshot['nextActions']).slice(0, 10).map((a) => ({
          action: String(a.action || '').slice(0, 200),
          priority: (['high', 'medium', 'low'] as const).includes(a.priority as 'high')
            ? (a.priority as 'high' | 'medium' | 'low')
            : 'medium',
          expectedImpact: String(a.expectedImpact || '').slice(0, 200),
        }))
      : [],
  }
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? Math.round(v) : NaN
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}