import { useMemo } from 'react'
import { Trophy, Activity, Target, Clock, AlertCircle, Bell, Calendar, AlertTriangle, TrendingDown, MapPinOff, Sparkles } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { LoadingState, ErrorState, EmptyState } from '../components/ui/states.js'
import { PageHeader } from '../components/ui/page-header.js'
import { SectionCard } from '../components/ui/section-card.js'
import { KpiTile, type KpiTone } from '../components/ui/kpi-tile.js'
import { StatusPill, type PillTone } from '../components/ui/status-pill.js'
import { cssColor, FUNNEL_COLOR_VARS, funnelSegmentOfMilestone } from '../components/ui/tokens.js'
import { useDashboardStats } from '../hooks/use-dashboard.js'
import { useAlerts } from '../hooks/use-alerts.js'
import { useTheme } from '../hooks/use-theme.js'
import { useNavigate } from 'react-router-dom'
import { useHasRole } from '../hooks/use-permission.js'
import { entityRouteTo } from '../lib/entity-links.js'
import { sendAiPrompt } from '../lib/ai-prompt.js'
import type { AlertItem } from '../hooks/use-alerts.js'

const alertTypeMeta: Record<string, { icon: typeof AlertTriangle; label: string; tone: PillTone }> = {
  STALE_PROJECT: { icon: Clock, label: '停滞', tone: 'warning' },
  OVERDUE_LEAD: { icon: TrendingDown, label: '逾期', tone: 'danger' },
  DUE_TASK: { icon: Calendar, label: '到期', tone: 'primary' },
  LOW_HEALTH: { icon: AlertTriangle, label: '低健康', tone: 'danger' },
  MISSING_VISIT: { icon: MapPinOff, label: '缺拜访', tone: 'warning' },
}

const statMeta = [
  { label: '本周新增线索', key: 'newLeadsThisWeek' as const, icon: Activity, tone: 'primary' as const, reviewType: 'newLeads' as const },
  { label: '活跃商机', key: 'activeProjects' as const, icon: Target, tone: 'funnel-negotiate' as const, reviewType: 'activeProjects' as const },
  { label: '待跟进拜访', key: 'pendingVisits' as const, icon: Clock, tone: 'success' as const, reviewType: 'pendingVisits' as const },
  { label: '停滞预警', key: 'staleProjects' as const, icon: AlertCircle, tone: 'danger' as const, reviewType: 'staleProjects' as const },
]

/** 摘要小卡：类型 → 语义色调（一色一义） */
const summaryMeta: Array<{ label: string; key: string; tone: KpiTone }> = [
  { label: '停滞项目', key: 'staleProjects', tone: 'warning' },
  { label: '逾期线索', key: 'overdueLeads', tone: 'danger' },
  { label: '到期任务', key: 'dueTasks', tone: 'primary' },
  { label: '低健康度', key: 'lowHealthProjects', tone: 'danger' },
  { label: '缺拜访', key: 'missingVisits', tone: 'warning' },
]

export default function Reports() {
  const isManager = useHasRole('TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD')
  const { data, isLoading, error } = useDashboardStats()
  const { data: alertData, isLoading: alertLoading } = useAlerts()
  const navigate = useNavigate()
  const { isDark } = useTheme()

  const summary = alertData?.summary

  /* 图表配色：明暗档跟随 tokens（isDark 入依赖，切主题即重算） */
  const chart = useMemo(
    () => ({
      funnel: {
        nurture: cssColor(FUNNEL_COLOR_VARS.nurture),
        negotiate: cssColor(FUNNEL_COLOR_VARS.negotiate),
        close: cssColor(FUNNEL_COLOR_VARS.close),
      },
      textTertiary: cssColor('--color-text-tertiary'),
      surface: cssColor('--color-surface'),
      border: cssColor('--color-border'),
    }),
    [isDark],
  )

  const reviewPrompts = {
    staleProjects: `当前看板显示有 ${data?.staleProjects ?? 0} 个停滞项目。请帮我：\n1) 搜索这些停滞项目，分析它们停滞的共同原因；\n2) 按优先级排序，指出最应该先跟进的是哪个；\n3) 给出下一步具体行动建议，并附上可直接执行的 action cards。`,
    activeProjects: `当前有 ${data?.activeProjects ?? 0} 个活跃商机。请帮我：\n1) 分析这些商机的整体推进效率；\n2) 指出哪些里程碑阶段最容易卡住；\n3) 给出提升转化效率的建议和可直接执行的 action cards。`,
    pendingVisits: `当前有 ${data?.pendingVisits ?? 0} 个待跟进拜访。请帮我：\n1) 分析拜访计划的合理性；\n2) 给出拜访优先级排序建议；\n3) 如果有需要补充的拜访，请指出来并附上 action cards。`,
    newLeads: `本周新增 ${data?.newLeadsThisWeek ?? 0} 条线索。请帮我：\n1) 分析这些线索的质量和来源分布；\n2) 给出线索跟进的最佳节奏建议；\n3) 如果有高价值线索需要优先处理，请指出。`,
    overall: `请基于当前报表数据做一个整体复盘：\n- 本周新增线索：${data?.newLeadsThisWeek ?? 0}\n- 活跃商机：${data?.activeProjects ?? 0}\n- 平均健康度：${data?.avgHealthScore ?? 0}分\n- 停滞项目：${data?.staleProjects ?? 0}\n- 待跟进拜访：${data?.pendingVisits ?? 0}\n\n请指出当前销售漏斗的瓶颈在哪一步，并给出下周的行动重点和可直接执行的 action cards。`,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="数据报表"
        subtitle="销售漏斗与团队绩效分析"
        actions={
          <>
            {isManager && (
              <button
                onClick={() => navigate('/team-ranking')}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                title="团队成员绩效排名（管理者视角）"
              >
                <Trophy size={16} /> 团队排名
              </button>
            )}
            <button
              onClick={() => sendAiPrompt(reviewPrompts.overall)}
              className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Sparkles size={16} />
              AI 整体复盘
            </button>
          </>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statMeta.map((s) => {
          const value = data?.[s.key] ?? 0
          return (
            <KpiTile
              key={s.label}
              label={s.label}
              value={value}
              icon={s.icon}
              tone={s.tone}
              loading={isLoading}
              footer={
                !isLoading && (
                  <button
                    onClick={() => sendAiPrompt(reviewPrompts[s.reviewType])}
                    className="mt-3 flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary-hover"
                  >
                    <Sparkles size={12} />
                    AI 复盘
                  </button>
                )
              }
            />
          )
        })}
      </div>

      {error && <ErrorState message={(error as Error).message || '报表数据加载失败'} />}

      {/* Alert Summary */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {summaryMeta.map((s) => {
            const value = summary[s.key as keyof typeof summary] ?? 0
            const prompt =
              s.key === 'staleProjects'
                ? reviewPrompts.staleProjects
                : s.key === 'lowHealthProjects'
                  ? `当前有 ${summary.lowHealthProjects} 个低健康度项目。请帮我分析原因并给出改进建议，附上可直接执行的 action cards。`
                  : ''
            return (
              <KpiTile
                key={s.label}
                size="sm"
                label={s.label}
                value={value}
                tone={s.tone}
                footer={
                  prompt && value > 0 ? (
                    <button
                      onClick={() => sendAiPrompt(prompt)}
                      className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary transition-colors hover:text-primary-hover"
                    >
                      <Sparkles size={10} />
                      AI 复盘
                    </button>
                  ) : undefined
                }
              />
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Milestone Distribution Chart */}
        <SectionCard
          className="col-span-1 lg:col-span-2"
          title="商机里程碑分布"
          actions={
            data && (
              <span className="text-sm text-text-secondary">
                平均健康度 <span className="font-semibold text-primary">{data.avgHealthScore}分</span>
              </span>
            )
          }
        >
          {isLoading ? (
            <LoadingState />
          ) : (
            <ResponsiveContainer width="100%" height={256}>
              <BarChart data={data?.milestoneDistribution || []} barCategoryGap="20%">
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: chart.textTertiary }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: chart.textTertiary }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${chart.border}`,
                    background: chart.surface,
                    fontSize: 13,
                  }}
                />
                {/* 颜色即阶段：M0-M3 育单蓝 / M4-M6 谈单紫 / M7-M8 成单绿 */}
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {(data?.milestoneDistribution || []).map((_, i) => (
                    <Cell key={i} fill={chart.funnel[funnelSegmentOfMilestone(i)]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* Urgent Projects */}
        <SectionCard title="高优先级商机">
          {isLoading ? (
            <div className="mt-2 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-elevated" />
              ))}
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              {data?.urgentProjects.length === 0 && (
                <EmptyState icon={Target} title="暂无高优先级商机" compact />
              )}
              {data?.urgentProjects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5 cursor-pointer transition-colors hover:bg-surface-elevated/50"
                  onClick={() => navigate(entityRouteTo('project', p.id))}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{p.name}</p>
                    <p className="text-xs text-text-tertiary">{p.company?.name || '无关联客户'} · M{p.milestone}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill tone={p.urgency === 'CRITICAL' ? 'urgency-high' : 'urgency-mid'}>
                      {p.urgency === 'CRITICAL' ? '紧急' : '高'}
                    </StatusPill>
                    <span className="text-xs text-text-secondary">{p.healthScore ?? '-'}分</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Alert List */}
      <SectionCard
        title="AI 巡检预警"
        actions={
          alertData && (
            <span className="text-sm text-text-tertiary">
              共 {alertData.totalAlerts} 条预警 · 扫描于 {new Date(alertData.scanTime).toLocaleString('zh-CN')}
            </span>
          )
        }
      >
        {alertLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-2">
            {alertData?.alerts.length === 0 && <EmptyState icon={Bell} title="暂无预警，一切正常" compact />}
            {alertData?.alerts.slice(0, 10).map((alert: AlertItem) => {
              const meta = alertTypeMeta[alert.type]
              const Icon = meta?.icon || Bell
              return (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:bg-surface-elevated/50 cursor-pointer"
                  onClick={() => {
                    navigate(entityRouteTo(alert.entityType, alert.entityId))
                  }}
                >
                  <div className={`mt-0.5 shrink-0 ${meta?.tone === 'danger' ? 'text-danger' : meta?.tone === 'warning' ? 'text-warning' : 'text-primary'}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{alert.title}</span>
                      <StatusPill tone={alert.severity === 'HIGH' ? 'danger' : alert.severity === 'MEDIUM' ? 'warning' : 'neutral'}>
                        {alert.severity === 'HIGH' ? '高' : alert.severity === 'MEDIUM' ? '中' : '低'}
                      </StatusPill>
                      <span className="text-xs text-text-tertiary">{meta?.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{alert.description}</p>
                  </div>
                </div>
              )
            })}
            {alertData && alertData.alerts.length > 10 && (
              <p className="py-2 text-center text-xs text-text-tertiary">还有 {alertData.alerts.length - 10} 条预警...</p>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
