import { Check, Clock, AlertCircle, Calendar, HelpCircle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCompleteTask } from '../../hooks/use-tasks.js'
import type { Task } from '../../hooks/use-tasks.js'
import { cn } from '../../lib/utils.js'

interface TaskListCardProps {
  tasks: {
    overdue: Task[]
    dueToday: Task[]
    highPriority: Task[]
    pending: Task[]
  }
  isLoading?: boolean
  onItemClick?: (taskId: string) => void
}

const priorityLabel: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  URGENT: '紧急',
}

const priorityClass: Record<string, string> = {
  LOW: 'bg-success/10 text-success',
  MEDIUM: 'bg-warning/10 text-warning',
  HIGH: 'bg-danger/10 text-danger',
  URGENT: 'bg-danger/20 text-danger',
}

function TaskItem({ task, onClick }: { task: Task; onClick?: () => void }) {
  const complete = useCompleteTask()

  const formatDeadline = (deadline?: string) => {
    if (!deadline) return '无截止日期'
    const d = new Date(deadline)
    const today = new Date()
    const isToday =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    if (isToday) return '今日到期'
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <div
      className="group flex cursor-pointer items-center justify-between px-5 py-2.5 transition-colors hover:bg-surface-elevated/50"
      onClick={onClick}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <button
          onClick={(e) => {
            e.stopPropagation()
            complete.mutate(task.id)
          }}
          disabled={complete.isPending}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border text-text-tertiary transition-colors hover:border-primary hover:text-primary"
        >
          <Check size={14} />
        </button>
        <div className="min-w-0">
          <div className="truncate font-medium">{task.title}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
            {task.project && <span className="truncate">{task.project.name}</span>}
            {task.deadline && (
              <span className={cn('flex items-center gap-1', task.deadline < new Date().toISOString() ? 'text-danger' : '')}>
                <Clock size={12} />
                {formatDeadline(task.deadline)}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* 分区标题已表达分组语义，条目只保留优先级一个信号，避免双徽章噪音 */}
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', priorityClass[task.priority])}>
        {priorityLabel[task.priority]}
      </span>
    </div>
  )
}

/** 逾期/今日到期全量显示（今天必须行动的）；高优先级截断展示；待办只计数不展开 */
const SECTION_CAP: Record<string, number> = {
  overdue: Infinity,
  dueToday: Infinity,
  highPriority: 3,
  pending: 0,
}

export function TaskListCard({ tasks, isLoading, onItemClick }: TaskListCardProps) {
  const sections = [
    { key: 'overdue', title: '已逾期', icon: AlertCircle, items: tasks.overdue },
    { key: 'dueToday', title: '今日到期', icon: Calendar, items: tasks.dueToday },
    { key: 'highPriority', title: '高优先级', icon: AlertCircle, items: tasks.highPriority },
    { key: 'pending', title: '待办', icon: Clock, items: tasks.pending },
  ] as const

  const total = sections.reduce((sum, s) => sum + s.items.length, 0)
  const hiddenCount = sections.reduce(
    (sum, s) => sum + Math.max(0, s.items.length - SECTION_CAP[s.key]),
    0,
  )

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="h-6 w-32 animate-pulse rounded-lg bg-surface-elevated" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-elevated" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">今日任务</h3>
          <span title="分类规则：已逾期 = 截止日期已过；今日到期 = 截止日期为今天；高优先级 = 优先级 HIGH/URGENT；待办 = 其他未完成任务">
            <HelpCircle size={14} className="cursor-help text-text-tertiary" />
          </span>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary">{total}</span>
      </div>
      <div className="divide-y divide-border">
        {total === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-text-tertiary">
            暂无待办任务，享受一天清净 ☕️
          </div>
        ) : (
          sections.map((section) => {
            const cap = SECTION_CAP[section.key]
            const shown = section.items.slice(0, cap)
            const hidden = section.items.length - shown.length
            return section.items.length > 0 && cap > 0 ? (
              <div key={section.key}>
                <div className="flex items-center gap-2 bg-surface-elevated/30 px-5 py-2 text-xs font-medium text-text-secondary">
                  <section.icon size={14} />
                  {section.title}
                  <span className="ml-1 text-text-tertiary">({section.items.length})</span>
                </div>
                {shown.map((task) => (
                  <TaskItem key={task.id} task={task} onClick={() => onItemClick?.(task.id)} />
                ))}
                {hidden > 0 && (
                  <div className="px-5 py-2 text-xs text-text-tertiary">还有 {hidden} 条…</div>
                )}
              </div>
            ) : null
          })
        )}
        {hiddenCount > 0 && (
          <Link
            to="/tasks"
            className="flex items-center justify-center gap-1 border-t border-border px-5 py-3 text-sm text-primary transition-colors hover:bg-surface-elevated/50"
          >
            还有 {hiddenCount} 条任务，去任务页处理
            <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </div>
  )
}
