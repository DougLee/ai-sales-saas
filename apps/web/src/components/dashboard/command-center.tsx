import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  TrendingUp,
  Activity,
  Target,
  ClipboardList,
  Inbox,
  ChevronRight,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import type { Briefing } from '@ai-sales/shared'
import { buildJudgementSegments } from './battle.utils.js'
import { cn } from '../../lib/utils.js'

/**
 * 今日作战 · 指挥台（issue #34 区域①）
 * 一句话战场判断 + 四格可点 KPI，替代原「简报卡 + 指标 + 模块导航」三块平铺。
 */

export interface CommandCenterKpis {
  /** 推进中商机 */
  activeProjects: number
  /** 活跃线索（跟进中） */
  activeLeads: number
  /** 今日行动（逾期 + 今日到期） */
  todayActions: number
  /** 其中逾期 */
  overdueTasks: number
  /** 待确认件数 */
  pendingConfirmations: number
  /** 停滞商机 */
  staleProjects: number
}

interface CommandCenterProps {
  briefing: Briefing | undefined
  kpis: CommandCenterKpis
  isLoading?: boolean
  /** 「待确认」KPI 与提醒条的入口：打开过堂抽屉 */
  onOpenInbox: () => void
}

const INSIGHT_META: Record<string, { icon: LucideIcon; className: string }> = {
  risk: { icon: AlertTriangle, className: 'text-danger' },
  opportunity: { icon: TrendingUp, className: 'text-success' },
  pattern: { icon: Activity, className: 'text-primary' },
}

export function CommandCenter({ briefing, kpis, isLoading, onOpenInbox }: CommandCenterProps) {
  const navigate = useNavigate()

  const segments = buildJudgementSegments({
    overdueTasks: kpis.overdueTasks,
    pendingConfirmations: kpis.pendingConfirmations,
    staleProjects: kpis.staleProjects,
    activeLeads: kpis.activeLeads,
  })

  const goBattles = () => {
    const el = document.getElementById('today-battles')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else navigate('/tasks')
  }

  const kpiCells: Array<{
    label: string
    value: number
    hint?: string
    icon: LucideIcon
    color: string
    onClick: () => void
  }> = [
    {
      label: '推进中商机',
      value: kpis.activeProjects,
      icon: Target,
      color: 'text-warning',
      onClick: () => navigate('/projects'),
    },
    {
      label: '活跃线索',
      value: kpis.activeLeads,
      icon: Activity,
      color: 'text-primary',
      onClick: () => navigate('/leads'),
    },
    {
      label: kpis.overdueTasks > 0 ? `今日行动 · 逾期 ${kpis.overdueTasks}` : '今日行动',
      value: kpis.todayActions,
      icon: ClipboardList,
      color: kpis.overdueTasks > 0 ? 'text-danger' : 'text-success',
      onClick: goBattles,
    },
    {
      label: '待确认',
      value: kpis.pendingConfirmations,
      icon: Inbox,
      color: kpis.pendingConfirmations > 0 ? 'text-warning' : 'text-text-tertiary',
      onClick: onOpenInbox,
    },
  ]

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-surface-elevated" />
        <div className="mt-4 h-5 w-80 max-w-full animate-pulse rounded-lg bg-surface-elevated" />
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-surface-elevated" />
          ))}
        </div>
      </div>
    )
  }

  const insight = briefing?.insight
  const insightMeta = insight ? INSIGHT_META[insight.type] ?? INSIGHT_META.pattern : null
  const InsightIcon = insightMeta?.icon

  return (
    <section aria-label="作战指挥台" className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-text-primary">今日作战</h1>
        {briefing && (
          <p className="text-xs text-text-tertiary">
            {new Date(briefing.date).toLocaleDateString('zh-CN', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </p>
        )}
      </div>

      {/* 一句话战场判断 */}
      <div className="rounded-2xl border border-border bg-surface px-5 py-4">
        {insight && InsightIcon ? (
          <div className="flex items-start gap-3">
            <div className={cn('mt-0.5 shrink-0', insightMeta!.className)}>
              <InsightIcon size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {insight.title}
                <span className={cn('ml-2', insightMeta!.className)}>{insight.description}</span>
              </p>
            </div>
          </div>
        ) : null}
        <p className={cn('text-sm leading-6', insight ? 'mt-2' : '', 'text-text-secondary')}>
          {segments.length > 0 ? (
            segments.map((s, i) => (
              <span key={s.label}>
                {i > 0 && <span className="mx-1.5 text-text-tertiary">·</span>}
                {s.label}
                <span
                  className={cn(
                    'mx-0.5 font-semibold',
                    s.tone === 'danger' ? 'text-danger' : s.tone === 'warning' ? 'text-warning' : 'text-primary',
                  )}
                >
                  {s.count}
                </span>
                {s.label.includes('待跟进') ? ' 条' : s.label === '待确认' ? ' 件' : ' 项'}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-success" />
              各条战线平稳，保持节奏推进
            </span>
          )}
        </p>
      </div>

      {/* 四格可点 KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCells.map((cell) => {
          const Icon = cell.icon
          return (
            <button
              key={cell.label}
              type="button"
              onClick={cell.onClick}
              className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 text-left transition-all hover:border-primary/30 hover:shadow-glow"
            >
              <div className="flex items-center gap-3">
                <div className={cn('rounded-xl bg-surface-elevated p-2', cell.color)}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className={cn('text-lg font-semibold leading-tight', cell.color)}>{cell.value}</p>
                  <p className="text-xs text-text-tertiary">{cell.label}</p>
                </div>
              </div>
              <ChevronRight
                size={15}
                className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}
