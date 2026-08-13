import { useNavigate } from 'react-router-dom'
import { ArrowRight, AlertTriangle, Target, TrendingUp, Activity, type LucideIcon } from 'lucide-react'
import type { Briefing, PriorityAction } from '@ai-sales/shared'

export function BriefingCard({ briefing }: { briefing: Briefing }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">今日作战简报</h1>
        <p className="mt-0.5 text-sm text-text-tertiary">
          {new Date(briefing.date).toLocaleDateString('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        </p>
      </div>

      {/* Priority Actions */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary flex items-center gap-2">
          <Target size={16} className="text-primary" />
          优先动作（按紧急度排序）
        </h2>
        {briefing.priorityActions.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text-tertiary">暂无紧急动作，保持节奏</p>
          </div>
        ) : (
          briefing.priorityActions.map((action) => (
            <PriorityActionCard key={action.id} action={action} />
          ))
        )}
      </div>

      {/* Stats */}
      <StatsRow stats={briefing.stats} />
    </div>
  )
}

function PriorityActionCard({ action }: { action: PriorityAction }) {
  const navigate = useNavigate()

  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border px-5 py-4 transition-all hover:shadow-glow cursor-pointer ${
        action.rank === 1
          ? 'border-danger/20 bg-danger/5'
          : 'border-border bg-surface'
      }`}
      onClick={() => navigate(action.path)}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
          action.rank === 1
            ? 'bg-danger text-white'
            : action.rank === 2
            ? 'bg-warning text-white'
            : 'bg-primary/10 text-primary'
        }`}
      >
        {action.rank}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{action.title}</p>
        <p className="mt-0.5 text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">原因：</span>
          {action.reason}
        </p>
        <p className="mt-1 text-xs text-primary">
          建议：{action.suggestedAction}
        </p>
      </div>
      <ArrowRight size={16} className="shrink-0 text-text-tertiary" />
    </div>
  )
}

function StatsRow({ stats }: { stats: Briefing['stats'] }) {
  const items: Array<{ label: string; value: string | number; icon: LucideIcon; color: string }> = [
    { label: '本周新增线索', value: stats.newLeadsThisWeek, icon: Activity, color: 'text-primary' },
    { label: '活跃商机', value: stats.activeProjects, icon: Target, color: 'text-warning' },
    { label: '停滞预警', value: stats.staleProjects, icon: AlertTriangle, color: 'text-danger' },
    { label: '平均健康度', value: `${stats.avgHealthScore}分`, icon: TrendingUp, color: 'text-success' },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
          >
            <div className={`rounded-xl bg-surface-elevated p-2 ${item.color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className={`text-lg font-semibold leading-tight ${item.color}`}>{item.value}</p>
              <p className="text-xs text-text-tertiary">{item.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
