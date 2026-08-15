import type { PriorityAction } from '@ai-sales/shared'
import type { Task } from '../../hooks/use-tasks.js'
import type { PendingItem } from '../../hooks/use-confirmations.js'

/**
 * 今日作战 · 战役聚合纯函数（issue #34）
 * 任务按客户维度聚合成"作战单元"：逾期最重、其次优先级权重，top3 为三大战役。
 */

export interface BattleUnit {
  /** 聚合键：companyId 优先，无外键时退化为客户名 */
  key: string
  companyId: string | null
  companyName: string
  tasks: Task[]
  overdueCount: number
  dueTodayCount: number
  /** 紧迫分：逾期任务权重远高于其他信号 */
  score: number
}

const PRIORITY_WEIGHT: Record<string, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

export function isTaskOverdue(task: Task): boolean {
  if (!task.deadline) return false
  const d = new Date(task.deadline)
  if (Number.isNaN(d.getTime())) return false
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return d < todayStart
}

/** 任务的客户归属：task.company > task.project.company > 项目名 > 未关联 */
export function companyOfTask(task: Task): { id: string | null; name: string } {
  const company = task.company ?? task.project?.company ?? null
  if (company) return { id: company.id, name: company.name }
  if (task.project) return { id: null, name: task.project.name }
  return { id: null, name: '未关联客户' }
}

/**
 * 把 dashboard/me 的任务桶聚合为客户作战单元，按紧迫分降序。
 * 输入桶：逾期 / 今日到期 / 高优先级（三者互斥，防御性去重）。
 */
export function buildBattleUnits(buckets: {
  overdue: Task[]
  dueToday: Task[]
  highPriority: Task[]
}): BattleUnit[] {
  const seen = new Set<string>()
  const map = new Map<string, BattleUnit>()

  const push = (task: Task, bucket: 'overdue' | 'dueToday' | 'highPriority') => {
    if (seen.has(task.id)) return
    seen.add(task.id)
    const company = companyOfTask(task)
    const key = company.id ?? `name:${company.name}`
    let unit = map.get(key)
    if (!unit) {
      unit = {
        key,
        companyId: company.id,
        companyName: company.name,
        tasks: [],
        overdueCount: 0,
        dueTodayCount: 0,
        score: 0,
      }
      map.set(key, unit)
    }
    unit.tasks.push(task)
    if (bucket === 'overdue' || isTaskOverdue(task)) {
      unit.overdueCount += 1
      unit.score += 10
    } else if (bucket === 'dueToday') {
      unit.dueTodayCount += 1
      unit.score += 2
    }
    unit.score += PRIORITY_WEIGHT[task.priority] ?? 1
  }

  for (const t of buckets.overdue) push(t, 'overdue')
  for (const t of buckets.dueToday) push(t, 'dueToday')
  for (const t of buckets.highPriority) push(t, 'highPriority')

  return [...map.values()].sort((a, b) => b.score - a.score)
}

/**
 * 战役卡与 briefing 优先动作的关联：
 * briefing 的优先动作以项目名/任务题为实体名，能对上战役内的任务则把
 * 「原因 + 建议动作」挂到该战役卡上（rank 语义与 briefing rank 一致）。
 */
export function matchPriorityAction(unit: BattleUnit, actions: PriorityAction[]): PriorityAction | undefined {
  if (actions.length === 0) return undefined
  const projectNames = new Set(unit.tasks.map((t) => t.project?.name).filter(Boolean) as string[])
  const taskTitles = new Set(unit.tasks.map((t) => t.title))
  return actions.find(
    (a) => taskTitles.has(a.entityName) || (projectNames.size > 0 && projectNames.has(a.entityName)),
  )
}

/** 指挥台一句话战场判断的数字片段（全部为 0 时返回空数组，由调用方渲染平稳文案） */
export interface JudgementSegment {
  label: string
  count: number
  tone: 'danger' | 'warning' | 'primary'
}

export function buildJudgementSegments(input: {
  overdueTasks: number
  pendingConfirmations: number
  staleProjects: number
  activeLeads: number
}): JudgementSegment[] {
  const segments: JudgementSegment[] = []
  if (input.overdueTasks > 0) segments.push({ label: '逾期任务', count: input.overdueTasks, tone: 'danger' })
  if (input.pendingConfirmations > 0)
    segments.push({ label: '待确认', count: input.pendingConfirmations, tone: 'warning' })
  if (input.staleProjects > 0) segments.push({ label: '停滞商机', count: input.staleProjects, tone: 'warning' })
  if (input.activeLeads > 0) segments.push({ label: '活跃线索待跟进', count: input.activeLeads, tone: 'primary' })
  return segments
}

/** 待确认项按客户聚合（context.companyId 优先，退化为客户名匹配），供战役卡提醒条联动 */
export function groupPendingByCompany(items: PendingItem[]): Map<string, PendingItem[]> {
  const map = new Map<string, PendingItem[]>()
  for (const item of items) {
    const ctx = item.context
    const key = ctx?.companyId ? `id:${ctx.companyId}` : ctx?.companyName ? `name:${ctx.companyName}` : null
    if (!key) continue
    const list = map.get(key) || []
    list.push(item)
    map.set(key, list)
  }
  return map
}

/** 战役单元在待确认聚合里的键（与 groupPendingByCompany 的键口径一致） */
export function pendingKeysOfUnit(unit: BattleUnit): string[] {
  const keys: string[] = []
  if (unit.companyId) keys.push(`id:${unit.companyId}`)
  keys.push(`name:${unit.companyName}`)
  return keys
}
