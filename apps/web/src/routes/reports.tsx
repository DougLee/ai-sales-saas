import { Activity, Target, Clock, AlertCircle, Bell, Calendar, AlertTriangle, TrendingDown, MapPinOff, Sparkles } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { LoadingState, ErrorState } from '../components/ui/states.js'
import { useDashboardStats } from '../hooks/use-dashboard.js'
import { useAlerts } from '../hooks/use-alerts.js'
import { useNavigate } from 'react-router-dom'
import { entityRouteTo } from '../lib/entity-links.js'
import { sendAiPrompt } from '../lib/ai-prompt.js'
import type { AlertItem } from '../hooks/use-alerts.js'

const alertTypeMeta: Record<string, { icon: typeof AlertTriangle; label: string; color: string }> = {
  STALE_PROJECT: { icon: Clock, label: '停滞', color: 'text-warning' },
  OVERDUE_LEAD: { icon: TrendingDown, label: '逾期', color: 'text-danger' },
  DUE_TASK: { icon: Calendar, label: '到期', color: 'text-primary' },
  LOW_HEALTH: { icon: AlertTriangle, label: '低健康', color: 'text-danger' },
  MISSING_VISIT: { icon: MapPinOff, label: '缺拜访', color: 'text-warning' },
}

const statMeta = [
  { label: '本周新增线索', key: 'newLeadsThisWeek' as const, icon: Activity, color: 'text-primary', bg: 'bg-primary/10', reviewType: 'newLeads' as const },
  { label: '活跃商机', key: 'activeProjects' as const, icon: Target, color: 'text-warning', bg: 'bg-warning/10', reviewType: 'activeProjects' as const },
  { label: '待跟进拜访', key: 'pendingVisits' as const, icon: Clock, color: 'text-success', bg: 'bg-success/10', reviewType: 'pendingVisits' as const },
  { label: '停滞预警', key: 'staleProjects' as const, icon: AlertCircle, color: 'text-danger', bg: 'bg-danger/10', reviewType: 'staleProjects' as const },
]

const milestoneColors = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#10b981',
]

export default function Reports() {
  const { data, isLoading, error } = useDashboardStats()
  const { data: alertData, isLoading: alertLoading } = useAlerts()
  const navigate = useNavigate()

  const summary = alertData?.summary

  const reviewPrompts = {
    staleProjects: `当前看板显示有 ${data?.staleProjects ?? 0} 个停滞项目。请帮我：\n1) 搜索这些停滞项目，分析它们停滞的共同原因；\n2) 按优先级排序，指出最应该先跟进的是哪个；\n3) 给出下一步具体行动建议，并附上可直接执行的 action cards。`,
    activeProjects: `当前有 ${data?.activeProjects ?? 0} 个活跃商机。请帮我：\n1) 分析这些商机的整体推进效率；\n2) 指出哪些里程碑阶段最容易卡住；\n3) 给出提升转化效率的建议和可直接执行的 action cards。`,
    pendingVisits: `当前有 ${data?.pendingVisits ?? 0} 个待跟进拜访。请帮我：\n1) 分析拜访计划的合理性；\n2) 给出拜访优先级排序建议；\n3) 如果有需要补充的拜访，请指出来并附上 action cards。`,
    newLeads: `本周新增 ${data?.newLeadsThisWeek ?? 0} 条线索。请帮我：\n1) 分析这些线索的质量和来源分布；\n2) 给出线索跟进的最佳节奏建议；\n3) 如果有高价值线索需要优先处理，请指出。`,
    overall: `请基于当前报表数据做一个整体复盘：\n- 本周新增线索：${data?.newLeadsThisWeek ?? 0}\n- 活跃商机：${data?.activeProjects ?? 0}\n- 平均健康度：${data?.avgHealthScore ?? 0}分\n- 停滞项目：${data?.staleProjects ?? 0}\n- 待跟进拜访：${data?.pendingVisits ?? 0}\n\n请指出当前销售漏斗的瓶颈在哪一步，并给出下周的行动重点和可直接执行的 action cards。`,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">数据报表</h1>
          <p className="mt-0.5 text-sm text-text-tertiary">销售漏斗与团队绩效分析</p>
        </div>
        <button
          onClick={() => sendAiPrompt(reviewPrompts.overall)}
          className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <Sparkles size={16} />
          AI 整体复盘
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {statMeta.map((s) => {
          const Icon = s.icon
          const value = data?.[s.key] ?? 0
          return (
            <div
              key={s.label}
              className="rounded-2xl border border-border bg-surface p-5 transition-all hover:border-primary/30 hover:shadow-glow"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.bg}`}>
                  <Icon size={18} className={s.color} />
                </div>
                <span className="text-sm text-text-secondary">{s.label}</span>
              </div>
              <div className="mt-3">
                {isLoading ? (
                  <div className="h-8 w-16 animate-pulse rounded-lg bg-surface-elevated" />
                ) : (
                  <p className="text-3xl font-semibold text-text-primary">{value}</p>
                )}
              </div>
              {!isLoading && (
                <button
                  onClick={() => sendAiPrompt(reviewPrompts[s.reviewType])}
                  className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark transition-colors"
                >
                  <Sparkles size={12} />
                  AI 复盘
                </button>
              )}
            </div>
          )
        })}
      </div>

      {error && <ErrorState message={(error as Error).message || '报表数据加载失败'} />}

      {/* Alert Summary */}
      {summary && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: '停滞项目', value: summary.staleProjects, color: 'text-warning', bg: 'bg-warning/10', prompt: reviewPrompts.staleProjects },
            { label: '逾期线索', value: summary.overdueLeads, color: 'text-danger', bg: 'bg-danger/10', prompt: '' },
            { label: '到期任务', value: summary.dueTasks, color: 'text-primary', bg: 'bg-primary/10', prompt: '' },
            { label: '低健康度', value: summary.lowHealthProjects, color: 'text-danger', bg: 'bg-danger/10', prompt: `当前有 ${summary.lowHealthProjects} 个低健康度项目。请帮我分析原因并给出改进建议，附上可直接执行的 action cards。` },
            { label: '缺拜访', value: summary.missingVisits, color: 'text-warning', bg: 'bg-warning/10', prompt: '' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-text-tertiary">{s.label}</p>
              <p className={`mt-1 text-xl font-semibold ${s.color}`}>{s.value}</p>
              {s.prompt && s.value > 0 && (
                <button
                  onClick={() => sendAiPrompt(s.prompt)}
                  className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary-dark transition-colors"
                >
                  <Sparkles size={10} />
                  AI 复盘
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Milestone Distribution Chart */}
        <div className="col-span-2 rounded-2xl border border-border bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-medium text-text-primary">商机里程碑分布</h3>
            {data && (
              <span className="text-sm text-text-secondary">
                平均健康度 <span className="font-semibold text-primary">{data.avgHealthScore}分</span>
              </span>
            )}
          </div>
          {isLoading ? (
            <LoadingState />
          ) : (
            <ResponsiveContainer width="100%" height={256}>
              <BarChart data={data?.milestoneDistribution || []} barCategoryGap="20%">
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {(data?.milestoneDistribution || []).map((_, i) => (
                    <Cell key={i} fill={milestoneColors[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Urgent Projects */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="text-base font-medium text-text-primary">高优先级商机</h3>
          {isLoading ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-elevated" />
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {data?.urgentProjects.length === 0 && (
                <p className="py-8 text-center text-sm text-text-tertiary">暂无高优先级商机</p>
              )}
              {data?.urgentProjects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
                  onClick={() => navigate(entityRouteTo('project', p.id))}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{p.name}</p>
                    <p className="text-xs text-text-tertiary">{p.company?.name || '无关联客户'} · M{p.milestone}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.urgency === 'CRITICAL'
                          ? 'bg-danger/10 text-danger'
                          : 'bg-warning/10 text-warning'
                      }`}
                    >
                      {p.urgency === 'CRITICAL' ? '紧急' : '高'}
                    </span>
                    <span className="text-xs text-text-secondary">{p.healthScore ?? '-'}分</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alert List */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-medium text-text-primary">AI 巡检预警</h3>
          {alertData && (
            <span className="text-sm text-text-tertiary">
              共 {alertData.totalAlerts} 条预警 · 扫描于 {new Date(alertData.scanTime).toLocaleString('zh-CN')}
            </span>
          )}
        </div>
        {alertLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-2">
            {alertData?.alerts.length === 0 && (
              <p className="py-8 text-center text-sm text-text-tertiary">暂无预警，一切正常</p>
            )}
            {alertData?.alerts.slice(0, 10).map((alert: AlertItem) => {
              const meta = alertTypeMeta[alert.type]
              const Icon = meta?.icon || Bell
              return (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3 hover:bg-surface-elevated/50 transition-colors cursor-pointer"
                  onClick={() => {
                    navigate(entityRouteTo(alert.entityType, alert.entityId))
                  }}
                >
                  <div className={`mt-0.5 shrink-0 ${meta?.color || 'text-text-tertiary'}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{alert.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          alert.severity === 'HIGH'
                            ? 'bg-danger/10 text-danger'
                            : alert.severity === 'MEDIUM'
                              ? 'bg-warning/10 text-warning'
                              : 'bg-text-tertiary/10 text-text-tertiary'
                        }`}
                      >
                        {alert.severity === 'HIGH' ? '高' : alert.severity === 'MEDIUM' ? '中' : '低'}
                      </span>
                      <span className="text-xs text-text-tertiary">{meta?.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-text-secondary leading-relaxed">{alert.description}</p>
                  </div>
                </div>
              )
            })}
            {alertData && alertData.alerts.length > 10 && (
              <p className="py-2 text-center text-xs text-text-tertiary">还有 {alertData.alerts.length - 10} 条预警...</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
