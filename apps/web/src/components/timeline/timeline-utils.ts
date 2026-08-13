import type { ActivityEvent } from '../../hooks/use-activities.js'

/** 时间轴视图的纯逻辑（从组件文件抽出，满足 react-refresh 单导出约束） */

export type EventCategory = 'all' | 'customer' | 'contact' | 'lead' | 'project' | 'visit' | 'task' | 'system'

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  all: '全部',
  customer: '客户',
  contact: '联系人',
  lead: '线索',
  project: '商机',
  visit: '拜访',
  task: '任务',
  system: '系统',
}

/** 从 eventType 前缀推导类别（与后端 ActivityMeta.category 对齐） */
export function categoryOf(eventType: string): EventCategory {
  if (eventType.startsWith('COMPANY_')) return 'customer'
  if (eventType.startsWith('CONTACT_') || eventType.startsWith('PROJECT_CONTACT_') || eventType.startsWith('DECISION_')) return 'contact'
  if (eventType.startsWith('LEAD_')) return 'lead'
  if (
    eventType.startsWith('PROJECT_') ||
    eventType.startsWith('MILESTONE_') ||
    eventType.startsWith('HEALTH_') ||
    eventType.startsWith('WIN_')
  ) {
    return 'project'
  }
  if (eventType.startsWith('VISIT_')) return 'visit'
  if (eventType.startsWith('TASK_')) return 'task'
  return 'system'
}

export function filterEventsByCategory(events: ActivityEvent[], category: EventCategory): ActivityEvent[] {
  if (category === 'all') return events
  return events.filter((e) => categoryOf(e.eventType) === category)
}

/**
 * 筛选 chips 按需生成：全部 + 已加载事件里真实出现的类别（按 CATEGORY_LABELS 顺序）。
 * 事件少/类别单一时调用方应隐藏筛选条——8 个页签筛 1 条事件是喧宾夺主。
 */
export function presentCategories(events: ActivityEvent[]): EventCategory[] {
  const seen = new Set(events.map((e) => categoryOf(e.eventType)))
  return (Object.keys(CATEGORY_LABELS) as EventCategory[]).filter((c) => c === 'all' || seen.has(c))
}

/** 是否值得显示筛选条：超过一个真实类别才有筛选意义（全部/某类 二选一内容相同） */
export function shouldShowFilter(events: ActivityEvent[]): boolean {
  return presentCategories(events).length > 2
}
