import type { Visit } from '../../hooks/use-visits.js'

/**
 * 拜访中心「价值漏斗」纯逻辑（issue #41 A）：
 * 统计条即筛选器 / 待复盘置顶 / 本周按天分组·更早折叠。
 * 组件只负责渲染，判断全部收口在这里。
 */

export type VisitFilterKey = 'all' | 'week' | 'reviewing' | 'hasNext' | 'noCompany'

export interface VisitStats {
  /** 本周拜访（周一起算） */
  week: number
  /** 待复盘（workflowStage=REVIEWING） */
  reviewing: number
  /** 已产生任务（已留下一步行动的拜访，前端按 nextAction 聚合） */
  hasNext: number
  /** 未关联客户 */
  noCompany: number
}

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

/** 周一为一周之始（中文惯例） */
export function startOfWeek(now: Date = new Date()): Date {
  const d = startOfDay(now)
  const weekday = (d.getDay() + 6) % 7 // 周日 getDay()=0 → 6
  d.setDate(d.getDate() - weekday)
  return d
}

export function isThisWeek(iso: string, now: Date = new Date()): boolean {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  return t >= startOfWeek(now).getTime()
}

/** 待复盘：价值未兑现的拜访（issue #41：复盘完才许沉底） */
export function isReviewing(visit: Visit): boolean {
  return visit.workflowStage === 'REVIEWING'
}

/** 拜访是否留下了下一步（已产生任务/跟进的前端代理字段） */
export function hasNextAction(visit: Visit): boolean {
  return !!visit.nextAction && visit.nextAction.trim().length > 0
}

/** 是否未关联客户 */
export function isUnlinked(visit: Visit): boolean {
  return !visit.companyId && !visit.company?.id
}

export function visitStats(visits: Visit[], now: Date = new Date()): VisitStats {
  const weekStart = startOfWeek(now).getTime()
  return {
    week: visits.filter((v) => {
      const t = new Date(v.visitTime).getTime()
      return !Number.isNaN(t) && t >= weekStart
    }).length,
    reviewing: visits.filter(isReviewing).length,
    hasNext: visits.filter(hasNextAction).length,
    noCompany: visits.filter(isUnlinked).length,
  }
}

export function matchVisitFilter(visit: Visit, filter: VisitFilterKey, now: Date = new Date()): boolean {
  switch (filter) {
    case 'week':
      return isThisWeek(visit.visitTime, now)
    case 'reviewing':
      return isReviewing(visit)
    case 'hasNext':
      return hasNextAction(visit)
    case 'noCompany':
      return isUnlinked(visit)
    case 'all':
      return true
  }
}

/** 待复盘置顶拆分：REVIEWING 提到最上，其余沉入时间线 */
export function splitByReviewing(visits: Visit[]): { reviewing: Visit[]; rest: Visit[] } {
  const reviewing: Visit[] = []
  const rest: Visit[] = []
  for (const v of visits) (isReviewing(v) ? reviewing : rest).push(v)
  return { reviewing, rest }
}

export interface VisitDayGroup {
  /** 本地日期键 YYYY-MM-DD */
  key: string
  /** 今天 / 昨天 / 8月12日 周二 */
  label: string
  visits: Visit[]
}

export interface VisitTimeline {
  /** 本周按天分组，新的日子在前，组内新拜访在前 */
  days: VisitDayGroup[]
  /** 更早的拜访（时间倒序），由 UI 折叠 */
  earlier: Visit[]
}

const DAY_MS = 86_400_000

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 时间线组标签：今天/昨天走相对表述，更早落具体日期 */
export function dayGroupLabel(d: Date, now: Date = new Date()): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY_MS)
  if (diff === 0) return '今天'
  if (diff === -1) return '昨天'
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_ZH[d.getDay()]}`
}

/** 时间线分组：本周按天 / 更早整段折叠（替代 insert 序平铺） */
export function groupVisitTimeline(visits: Visit[], now: Date = new Date()): VisitTimeline {
  const sorted = [...visits].sort(
    (a, b) => new Date(b.visitTime).getTime() - new Date(a.visitTime).getTime(),
  )
  const weekStart = startOfWeek(now).getTime()
  const dayMap = new Map<string, VisitDayGroup>()
  const earlier: Visit[] = []
  for (const v of sorted) {
    const t = new Date(v.visitTime)
    if (Number.isNaN(t.getTime()) || t.getTime() < weekStart) {
      earlier.push(v)
      continue
    }
    const key = localDateKey(t)
    const group = dayMap.get(key) || { key, label: dayGroupLabel(t, now), visits: [] }
    group.visits.push(v)
    dayMap.set(key, group)
  }
  return { days: [...dayMap.values()], earlier }
}

export type NextActionDeadlineState = 'overdue' | 'today' | 'future'

/** 下一步截止日分级：逾期（红）/ 今天（橙）/ 以后（灰） */
export function nextActionDeadlineState(
  deadline: string | undefined,
  now: Date = new Date(),
): NextActionDeadlineState | null {
  if (!deadline) return null
  const t = new Date(deadline)
  if (Number.isNaN(t.getTime())) return null
  const dayStart = startOfDay(now).getTime()
  if (t.getTime() < dayStart) return 'overdue'
  if (t.getTime() < dayStart + DAY_MS) return 'today'
  return 'future'
}
