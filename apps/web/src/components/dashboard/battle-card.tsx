import { useNavigate } from 'react-router-dom'
import { Check, Clock, Inbox, Lightbulb } from 'lucide-react'
import type { PriorityAction } from '@ai-sales/shared'
import { useCompleteTask } from '../../hooks/use-tasks.js'
import type { Task } from '../../hooks/use-tasks.js'
import type { BattleUnit } from './battle.utils.js'
import { isTaskOverdue } from './battle.utils.js'
import AiEntryButton from '../ai/ai-entry-button.js'
import { cn } from '../../lib/utils.js'

/**
 * 今日作战 · 战役卡（issue #34 区域②）
 * 客户聚合的作战单元：rank 徽章 + 今日任务（可勾选完成）+ 待确认提醒条 + briefing 优先动作。
 */

const RANK_CLASS: Record<number, string> = {
  1: 'bg-danger text-white',
  2: 'bg-warning text-white',
  3: 'bg-primary/15 text-primary',
}

const priorityClass: Record<string, string> = {
  LOW: 'bg-success/10 text-success',
  MEDIUM: 'bg-warning/10 text-warning',
  HIGH: 'bg-danger/10 text-danger',
  URGENT: 'bg-danger/20 text-danger',
}

const priorityLabel: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  URGENT: '紧急',
}

function formatDeadline(deadline?: string): string | null {
  if (!deadline) return null
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  const isToday =
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  if (isToday) return '今日到期'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function BattleTaskRow({ task }: { task: Task }) {
  const complete = useCompleteTask()
  const deadline = formatDeadline(task.deadline)
  const overdue = isTaskOverdue(task)

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2 transition-colors hover:bg-surface-elevated/50">
      <div className="flex min-w-0 items-center gap-3">
        <button
          aria-label={`完成任务：${task.title}`}
          onClick={() => complete.mutate(task.id)}
          disabled={complete.isPending}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border text-text-tertiary transition-colors hover:border-primary hover:text-primary"
        >
          <Check size={14} />
        </button>
        <div className="min-w-0">
          <div className={cn('truncate text-sm', overdue && 'text-danger')}>{task.title}</div>
          {deadline && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-text-tertiary">
              <Clock size={11} />
              <span className={overdue ? 'text-danger' : undefined}>{overdue ? '已逾期' : deadline}</span>
            </div>
          )}
        </div>
      </div>
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', priorityClass[task.priority])}>
        {priorityLabel[task.priority] ?? task.priority}
      </span>
    </div>
  )
}

interface BattleCardProps {
  unit: BattleUnit
  rank: number
  /** 该客户名下的待确认件数（提醒条与过堂抽屉联动） */
  pendingCount: number
  /** briefing 优先动作（实体名能对上战役内任务时挂载） */
  matchedAction?: PriorityAction
  onOpenInbox: (focusItemId?: string) => void
  /** 该客户最紧的一条待确认项（点击提醒条直达过堂） */
  firstPendingId?: string
}

export function BattleCard({ unit, rank, pendingCount, matchedAction, onOpenInbox, firstPendingId }: BattleCardProps) {
  const navigate = useNavigate()
  const question = [
    `关于客户「${unit.companyName}」今天的作战：`,
    ...unit.tasks.slice(0, 5).map((t) => `「${t.title}」`),
    '帮我判断优先打哪一场、下一步怎么推进最有效？',
  ].join('')

  return (
    <div className="rounded-2xl border border-border bg-surface">
      {/* 卡头：rank 徽章 + 客户名 + 问小销 */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
            RANK_CLASS[rank] ?? 'bg-surface-elevated text-text-secondary',
          )}
          title={`紧迫度第 ${rank} 的战役`}
        >
          {rank}
        </span>
        <button
          type="button"
          onClick={() => (unit.companyId ? navigate(`/customers?id=${unit.companyId}`) : undefined)}
          className={cn(
            'min-w-0 truncate text-left text-sm font-semibold text-text-primary',
            unit.companyId && 'hover:text-primary',
          )}
          title={unit.companyName}
        >
          {unit.companyName}
        </button>
        <span className="shrink-0 text-xs text-text-tertiary">
          {unit.tasks.length} 项任务{unit.overdueCount > 0 && ` · 逾期 ${unit.overdueCount}`}
        </span>
        <span className="ml-auto shrink-0">
          <AiEntryButton
            prompt={question}
            label="问小销"
            entityType={unit.companyId ? 'customer' : undefined}
            entityId={unit.companyId ?? undefined}
          />
        </span>
      </div>

      {/* 今日任务（可勾选完成），超长截断引导去任务页 */}
      <div className="divide-y divide-border">
        {unit.tasks.slice(0, 6).map((task) => (
          <BattleTaskRow key={task.id} task={task} />
        ))}
        {unit.tasks.length > 6 && (
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="w-full px-5 py-2 text-left text-xs text-primary hover:bg-surface-elevated/50"
          >
            还有 {unit.tasks.length - 6} 项任务，去任务页处理 →
          </button>
        )}
      </div>

      {/* 待确认提醒条（与过堂抽屉联动） */}
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => onOpenInbox(firstPendingId)}
          className="flex w-full items-center justify-between gap-2 border-t border-border bg-warning/5 px-5 py-2.5 text-left transition-colors hover:bg-warning/10"
        >
          <span className="flex min-w-0 items-center gap-2 text-xs text-warning">
            <Inbox size={13} className="shrink-0" />
            <span className="truncate">
              上次拜访 AI 提取的 {pendingCount} 条信息待确认
              {unit.overdueCount === 0 ? '' : '，先过堂再打'}
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-warning">去确认 →</span>
        </button>
      )}

      {/* briefing 优先动作：原因 + 建议 */}
      {matchedAction && (
        <div className="flex items-start gap-2 border-t border-border px-5 py-2.5">
          <Lightbulb size={13} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-xs leading-5 text-text-secondary">
            <span className="text-text-primary">建议：</span>
            {matchedAction.suggestedAction}
            <button
              type="button"
              onClick={() => navigate(matchedAction.path)}
              className="ml-1 text-primary hover:underline"
            >
              前往处理
            </button>
          </p>
        </div>
      )}
    </div>
  )
}
