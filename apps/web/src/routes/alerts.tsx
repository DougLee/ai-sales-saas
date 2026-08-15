import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, TrendingDown, Calendar, AlertTriangle, MapPinOff,
  Bell, Loader2, RefreshCw, Filter, AlertCircle, Check,
} from 'lucide-react'
import { post } from '../lib/api.js'
import { toast } from '../lib/toast.js'
import { entityRouteTo } from '../lib/entity-links.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { useAlerts, useMarkAlertRead, useMarkAllAlertsRead, type AlertSummary } from '../hooks/use-alerts.js'

const alertTypeMeta: Record<string, { icon: typeof AlertTriangle; label: string; color: string; bg: string }> = {
  STALE_PROJECT: { icon: Clock, label: '停滞项目', color: 'text-warning', bg: 'bg-warning/10' },
  OVERDUE_LEAD: { icon: TrendingDown, label: '逾期线索', color: 'text-danger', bg: 'bg-danger/10' },
  DUE_TASK: { icon: Calendar, label: '到期任务', color: 'text-primary', bg: 'bg-primary/10' },
  LOW_HEALTH: { icon: AlertTriangle, label: '低健康度', color: 'text-danger', bg: 'bg-danger/10' },
  MISSING_VISIT: { icon: MapPinOff, label: '缺少拜访', color: 'text-warning', bg: 'bg-warning/10' },
}

export default function AlertsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // P1：筛选状态进 URL，刷新/分享链接不丢筛选
  const [searchParams, setSearchParams] = useSearchParams()
  const typeFilter = searchParams.get('type') || 'ALL'
  const severityFilter = searchParams.get('severity') || 'ALL'
  const setFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === 'ALL') next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }
  const setTypeFilter = (v: string) => setFilter('type', v)
  const setSeverityFilter = (v: string) => setFilter('severity', v)

  const { data, isLoading, error } = useAlerts()
  const markRead = useMarkAlertRead()
  const markAllRead = useMarkAllAlertsRead()

  const scanMutation = useMutation({
    mutationFn: () => post<{ jobId: string; message: string }>('/api/alerts/scan'),
    onSuccess: (res) => {
      toast(res.message || '扫描任务已提交', 'success')
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
    onError: (err: Error) => {
      toast(err.message || '扫描失败', 'error')
    },
  })

  const filteredAlerts = data?.alerts.filter((a) => {
    if (typeFilter !== 'ALL' && a.type !== typeFilter) return false
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false
    return true
  }) ?? []

  const summary = data?.summary

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">AI 巡检中心</h1>
          {data && (
            <p className="mt-1 text-sm text-text-tertiary">
              共 {data.totalAlerts} 条预警 · {data.unreadCount ?? 0} 条未读 · 上次扫描 {new Date(data.scanTime).toLocaleString('zh-CN')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(data?.unreadCount ?? 0) > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary transition-all hover:bg-surface-elevated disabled:opacity-50"
            >
              {markAllRead.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              全部标记已读
            </button>
          )}
          <button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-hover disabled:opacity-50"
          >
            {scanMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            立即扫描
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { key: 'staleProjects', ...alertTypeMeta.STALE_PROJECT, label: '停滞项目' },
            { key: 'overdueLeads', ...alertTypeMeta.OVERDUE_LEAD, label: '逾期线索' },
            { key: 'dueTasks', ...alertTypeMeta.DUE_TASK, label: '到期任务' },
            { key: 'lowHealthProjects', ...alertTypeMeta.LOW_HEALTH, label: '低健康度' },
            { key: 'missingVisits', ...alertTypeMeta.MISSING_VISIT, label: '缺少拜访' },
          ].map((s) => {
            const Icon = s.icon
            const value = summary[s.key as keyof AlertSummary]
            return (
              <div key={s.key} className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="flex items-center gap-2">
                  <Icon size={14} className={s.color} />
                  <span className="text-xs text-text-tertiary">{s.label}</span>
                </div>
                <p className={`mt-1 text-2xl font-semibold ${s.color}`}>{value}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <Filter size={14} className="text-text-tertiary" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-transparent text-sm text-text-primary outline-none"
          >
            <option value="ALL">全部类型</option>
            {Object.entries(alertTypeMeta).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <AlertCircle size={14} className="text-text-tertiary" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-transparent text-sm text-text-primary outline-none"
          >
            <option value="ALL">全部级别</option>
            <option value="HIGH">高</option>
            <option value="MEDIUM">中</option>
            <option value="LOW">低</option>
          </select>
        </div>
        <span className="text-sm text-text-tertiary">
          筛选结果：{filteredAlerts.length} 条
        </span>
      </div>

      {/* Alert List */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        {isLoading && <LoadingState />}

        {error && <ErrorState message={(error as Error).message || '预警数据加载失败'} />}

        {!isLoading && !error && filteredAlerts.length === 0 && (
          <EmptyState icon={Bell} title="暂无预警，一切正常" />
        )}

        <div className="space-y-2">
          {filteredAlerts.map((alert) => {
            const meta = alertTypeMeta[alert.type]
            const Icon = meta?.icon || Bell
            return (
              <div
                key={alert.id}
                className={`flex items-start gap-3 rounded-xl border border-border px-4 py-3 transition-colors cursor-pointer ${
                  alert.read
                    ? 'bg-surface-elevated/30 opacity-60'
                    : 'bg-background hover:bg-surface-elevated/50'
                }`}
                onClick={() => {
                  // P1：走统一深链协议，直达对应实体详情
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
                    {alert.read && (
                      <span className="rounded-full bg-text-tertiary/10 px-2 py-0.5 text-[10px] text-text-tertiary">
                        已读
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-text-secondary leading-relaxed">{alert.description}</p>
                  {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {Object.entries(alert.metadata).map(([k, v]) => (
                        <span key={k} className="rounded-md bg-surface-elevated px-2 py-0.5 text-[11px] text-text-tertiary">
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {!alert.read && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      markRead.mutate(alert.id)
                    }}
                    disabled={markRead.isPending}
                    className="mt-0.5 shrink-0 rounded-lg p-1.5 text-text-tertiary hover:bg-primary/10 hover:text-primary transition-colors"
                    title="标记已读"
                  >
                    <Check size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
