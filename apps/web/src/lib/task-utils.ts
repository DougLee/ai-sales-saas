import type { Task } from '../hooks/use-tasks.js'

/** 任务列表纯逻辑：分组/排序/期限分级。组件只负责渲染，不在组件里堆判断 */

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function isDone(task: Task): boolean {
  return task.status === 'COMPLETED' || task.status === 'CANCELLED'
}

/** 逾期判断按「日」粒度：截止当天不算逾期 */
export function isOverdue(task: Task): boolean {
  if (!task.deadline || isDone(task)) return false
  return new Date(task.deadline) < startOfToday()
}

/** 今天截止（且未完成） */
export function isDueToday(task: Task): boolean {
  if (!task.deadline || isDone(task)) return false
  const d = new Date(task.deadline)
  const today = startOfToday()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return d >= today && d < tomorrow
}

export function overdueDays(task: Task): number {
  if (!isOverdue(task)) return 0
  const ms = startOfToday().getTime() - new Date(task.deadline!).getTime()
  return Math.max(1, Math.ceil(ms / 86400000))
}

export type DeadlineTone = 'danger' | 'warning' | 'muted'

/** 期限拟人化分级：已逾期 N 天（红）/ 今天（橙）/ 明天 / 具体日期（灰） */
export function deadlineInfo(task: Task): { text: string; tone: DeadlineTone } | null {
  if (!task.deadline) return null
  if (isOverdue(task)) return { text: `已逾期 ${overdueDays(task)} 天`, tone: 'danger' }
  const d = new Date(task.deadline)
  if (isDueToday(task)) return { text: '今天截止', tone: 'warning' }
  const today = startOfToday()
  const dayAfterTomorrow = new Date(today)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
  if (d < dayAfterTomorrow) return { text: '明天截止', tone: 'muted' }
  return { text: `${d.getMonth() + 1}/${d.getDate()} 截止`, tone: 'muted' }
}

export function deadlineTime(task: Task): number {
  return task.deadline ? new Date(task.deadline).getTime() : Number.POSITIVE_INFINITY
}

/** 组内排序：按截止日期升序（逾期自然在前），无截止排最后 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => deadlineTime(a) - deadlineTime(b))
}

export interface TaskGroup {
  key: string
  title: string
  tasks: Task[]
}

/** 组标题：项目名常以客户名开头（如“XX大学-人工智能通识课”），去掉重复前缀 */
export function groupTitle(companyName: string, projectName?: string): string {
  if (!projectName) return companyName || '未关联客户/商机'
  if (!companyName) return projectName
  let pn = projectName
  if (pn.startsWith(companyName)) {
    pn = pn.slice(companyName.length).replace(/^[\s\-·—_:：]+/, '')
  }
  return pn ? `${companyName} · ${pn}` : companyName
}

/** 按「客户 · 商机」分组，组按最近截止日升序（最急的组排最前） */
export function groupTasks(tasks: Task[]): TaskGroup[] {
  const map = new Map<string, TaskGroup>()
  for (const t of tasks) {
    const companyName = t.project?.company?.name || t.company?.name || ''
    const key = t.project?.id ? `p:${t.project.id}` : t.company?.id ? `c:${t.company.id}` : 'other'
    const title = groupTitle(companyName, t.project?.name)
    const group = map.get(key) || { key, title, tasks: [] }
    group.tasks.push(t)
    map.set(key, group)
  }
  const groups = [...map.values()]
  for (const g of groups) g.tasks = sortTasks(g.tasks)
  groups.sort((a, b) => {
    const aTime = Math.min(...a.tasks.map(deadlineTime))
    const bTime = Math.min(...b.tasks.map(deadlineTime))
    return aTime - bTime
  })
  return groups
}

/** 今日聚焦：逾期 + 今天到期的未完成任务，按截止升序 */
export function focusTasks(tasks: Task[]): Task[] {
  return sortTasks(tasks.filter((t) => !isDone(t) && (isOverdue(t) || isDueToday(t))))
}
