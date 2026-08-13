import {
  TrendingUp, Building2, Flag, AlertTriangle,
  KanbanSquare, ShieldCheck, Copy, Clock, FileWarning, Users,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePipeline, type Project } from '../hooks/use-projects.js'
import { useDataQuality } from '../hooks/use-data-quality.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import AiEntryButton from '../components/ai/ai-entry-button.js'

const milestoneColors = [
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
  'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500', 'bg-orange-500', 'bg-emerald-500',
]

const urgencyMap: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: '紧急', color: 'bg-danger/10 text-danger' },
  HIGH: { label: '高', color: 'bg-warning/10 text-warning' },
  MEDIUM: { label: '中', color: 'bg-primary/10 text-primary' },
  LOW: { label: '低', color: 'bg-success/10 text-success' },
}

function sumAmount(items: Project[]): number {
  return items.reduce((acc, p) => acc + (typeof p.amount === 'number' ? p.amount : 0), 0)
}

type TabKey = 'board' | 'quality'

export default function Pipeline() {
  // P2：页签进 URL（?tab=board/quality），刷新/分享不丢
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: TabKey = searchParams.get('tab') === 'quality' ? 'quality' : 'board'
  const setTab = (t: TabKey) => {
    const params = new URLSearchParams(searchParams)
    if (t === 'board') params.delete('tab')
    else params.set('tab', t)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-text-primary">
            <TrendingUp size={20} className="text-primary" /> 销售看板
          </h2>
          <p className="mt-1 text-sm text-text-secondary">销售工作流推进与数据质量监控</p>
        </div>
        <AiEntryButton
          prompt={
            tab === 'board'
              ? '帮我盘点当前销售 Pipeline，哪些阶段商机积压、哪些需要优先推进'
              : '帮我分析当前 CRM 数据质量问题，哪些客户资料不全、有哪些重复或长期未跟进的客户需要处理'
          }
          label="问小销"
          variant="primary"
          className="rounded-xl px-4 py-2 text-sm"
        />
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        <TabButton active={tab === 'board'} onClick={() => setTab('board')} icon={KanbanSquare} label="工作流看板" />
        <TabButton active={tab === 'quality'} onClick={() => setTab('quality')} icon={ShieldCheck} label="数据质量" />
      </div>

      {tab === 'board' ? <BoardPanel /> : <QualityPanel />}
    </div>
  )
}

function TabButton({
  active, onClick, icon: Icon, label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof KanbanSquare
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:bg-surface-elevated'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}

function BoardPanel() {
  const { data, isLoading, error, refetch } = usePipeline()
  const navigate = useNavigate()

  const columns = data?.columns || []
  const total = data?.total || 0
  const totalAmount = columns.reduce((acc, col) => acc + sumAmount(col.items), 0)

  return (
    <div className="rounded-2xl border border-border bg-surface">
      {isLoading && <LoadingState label="加载看板..." />}
      {error && <ErrorState message={(error as Error).message} onRetry={() => refetch()} />}
      {!isLoading && !error && total === 0 && (
        <EmptyState title="暂无在跟商机" description="商机推进后将在此按阶段展示" />
      )}

      {!isLoading && !error && total > 0 && (
        <>
          <div className="border-b border-border px-4 py-2 text-sm text-text-secondary">
            全部在跟商机 {total} 个{totalAmount > 0 ? ` · 预估总额 ${totalAmount} 万` : ''}
          </div>
          <div className="overflow-x-auto p-4">
            <div className="flex min-w-[1280px] gap-3">
              {columns.map((col) => {
                const colAmount = sumAmount(col.items)
                return (
                  <div key={col.milestone} className="flex w-64 flex-col rounded-xl border border-border bg-surface-elevated/50">
                    <div className="border-b border-border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${milestoneColors[col.milestone] ?? 'bg-border'}`} />
                        <span className="text-xs font-medium text-text-secondary">M{col.milestone} {col.name}</span>
                        <span className="ml-auto rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-text-tertiary">{col.items.length}</span>
                      </div>
                      {colAmount > 0 && (
                        <p className="mt-1 text-[10px] text-text-tertiary">预估 {colAmount} 万</p>
                      )}
                    </div>
                    <div className="flex-1 space-y-2 p-2">
                      {col.items.length === 0 && (
                        <p className="px-1 py-4 text-center text-[10px] text-text-tertiary">本阶段暂无商机</p>
                      )}
                      {col.items.map((project) => (
                        <div
                          key={project.id}
                          onClick={() => navigate(`/projects?id=${project.id}`)}
                          className="cursor-pointer rounded-lg border border-border bg-surface p-3 shadow-sm transition-all hover:border-primary/30 hover:shadow-glow"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-sm font-medium text-text-primary">{project.name}</p>
                            {project.healthScore != null && (
                              <span className={`shrink-0 text-[10px] font-medium ${
                                project.healthScore >= 60 ? 'text-success' :
                                project.healthScore >= 40 ? 'text-warning' :
                                'text-danger'
                              }`}>
                                {project.healthScore}分
                              </span>
                            )}
                          </div>
                          {project.company?.name && (
                            <p className="mt-1 flex items-center gap-1 truncate text-xs text-text-tertiary">
                              <Building2 size={10} /> {project.company.name}
                            </p>
                          )}
                          <div className="mt-2 flex items-center justify-between">
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${urgencyMap[project.urgency]?.color || 'bg-text-tertiary/10 text-text-tertiary'}`}>
                              {urgencyMap[project.urgency]?.label || project.urgency}
                            </span>
                            {project.amount != null && (
                              <span className="text-[10px] font-medium text-primary">{project.amount} 万</span>
                            )}
                          </div>
                          {project.tasks && project.tasks.length > 0 && (
                            <div className="mt-2 flex items-center gap-1 border-t border-border pt-2 text-[10px] text-text-tertiary">
                              <Flag size={10} /> {project.tasks.length} 个待办
                            </div>
                          )}
                          {project.isStale && (
                            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-warning">
                              <AlertTriangle size={10} /> 已停滞
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function fmtDate(value: string | null): string {
  if (!value) return '从未'
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function QualityPanel() {
  const { data, isLoading, error, refetch } = useDataQuality()
  const navigate = useNavigate()

  if (isLoading) {
    return <div className="rounded-2xl border border-border bg-surface"><LoadingState label="统计数据质量..." /></div>
  }
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <ErrorState message={(error as Error)?.message || '加载失败'} onRetry={() => refetch()} />
      </div>
    )
  }

  const { completeness, duplicates, staleCustomers, overdueLeads, staleProjects } = data
  const completePct = completeness.total ? Math.round((completeness.high / completeness.total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* 指标卡片 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          icon={ShieldCheck}
          color="text-primary"
          bg="bg-primary/10"
          label="平均完整度"
          value={`${completeness.avgScore}`}
          suffix="分"
          hint={`${completeness.total} 个客户`}
        />
        <MetricCard
          icon={Copy}
          color="text-warning"
          bg="bg-warning/10"
          label="疑似重复客户"
          value={`${duplicates.companies}`}
          suffix="个"
          hint={`${duplicates.groups} 组`}
          onClick={duplicates.companies > 0 ? () => navigate('/customers') : undefined}
        />
        <MetricCard
          icon={Clock}
          color="text-danger"
          bg="bg-danger/10"
          label="长期未跟进客户"
          value={`${staleCustomers.count}`}
          suffix="个"
          hint="30 天内无拜访"
          onClick={staleCustomers.count > 0 ? () => navigate('/customers?status=following') : undefined}
        />
        <MetricCard
          icon={FileWarning}
          color="text-warning"
          bg="bg-warning/10"
          label="超期未处理线索"
          value={`${overdueLeads.count}`}
          suffix="条"
          hint="14 天未跟进"
          onClick={overdueLeads.count > 0 ? () => navigate('/leads') : undefined}
        />
      </div>

      {/* 完整度分布 */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Users size={16} className="text-primary" /> 客户完整度分布
        </h3>
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-elevated">
          {completeness.total > 0 ? (
            <>
              <div className="bg-success" style={{ width: `${(completeness.high / completeness.total) * 100}%` }} />
              <div className="bg-warning" style={{ width: `${(completeness.medium / completeness.total) * 100}%` }} />
              <div className="bg-danger" style={{ width: `${(completeness.low / completeness.total) * 100}%` }} />
            </>
          ) : (
            <div className="w-full bg-border" />
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <DistLabel color="bg-success" label="完整（≥80）" count={completeness.high} />
          <DistLabel color="bg-warning" label="一般（50-79）" count={completeness.medium} />
          <DistLabel color="bg-danger" label="待完善（<50）" count={completeness.low} />
        </div>
        <p className="mt-3 text-xs text-text-tertiary">资料完整客户占比 {completePct}%</p>
      </div>

      {/* 明细列表 */}
      <div className="grid gap-3 md:grid-cols-2">
        <DetailList
          title="长期未跟进客户"
          icon={Clock}
          empty="所有在跟客户近期都有拜访"
          rows={staleCustomers.items.map((c) => ({
            id: c.id,
            primary: c.name,
            secondary: `上次拜访 ${fmtDate(c.lastVisitTime)}`,
            onClick: () => navigate(`/customers?id=${c.id}`),
          }))}
        />
        <DetailList
          title="超期未处理线索"
          icon={FileWarning}
          empty="暂无超期线索"
          rows={overdueLeads.items.map((l) => ({
            id: l.id,
            primary: l.name,
            secondary: `${l.companyName ?? '未关联客户'} · 上次跟进 ${fmtDate(l.lastFollowUpAt)}`,
            onClick: () => navigate(`/leads?id=${l.id}`),
          }))}
        />
        <DetailList
          title="停滞商机"
          icon={AlertTriangle}
          empty="暂无停滞商机"
          rows={staleProjects.items.map((p) => ({
            id: p.id,
            primary: p.name,
            secondary: `${p.companyName ?? '未关联客户'} · 停滞自 ${fmtDate(p.staleSince)}`,
            onClick: () => navigate(`/projects?id=${p.id}`),
          }))}
        />
        <DetailList
          title="疑似重复客户"
          icon={Copy}
          empty="未发现重复客户"
          rows={duplicates.items.map((g, i) => ({
            id: `${g.name}-${i}`,
            primary: g.name,
            secondary: `${g.count} 条同名记录`,
            onClick: () => navigate(`/customers?status=all`),
          }))}
        />
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon, color, bg, label, value, suffix, hint, onClick,
}: {
  icon: typeof ShieldCheck
  color: string
  bg: string
  label: string
  value: string
  suffix?: string
  hint?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-border bg-surface p-4 ${onClick ? 'cursor-pointer transition-all hover:border-primary/30 hover:shadow-glow' : ''}`}
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${bg}`}>
        <Icon size={18} className={color} />
      </div>
      <p className="mt-3 text-xs text-text-tertiary">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-text-primary">
        {value}<span className="ml-0.5 text-sm font-normal text-text-tertiary">{suffix}</span>
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-text-tertiary">{hint}</p>}
    </div>
  )
}

function DistLabel({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="flex items-center gap-1 text-text-secondary">
        <span className={`h-2 w-2 rounded-full ${color}`} /> {label}
      </span>
      <span className="text-sm font-semibold text-text-primary">{count}</span>
    </div>
  )
}

interface DetailRow {
  id: string
  primary: string
  secondary: string
  onClick: () => void
}

function DetailList({
  title, icon: Icon, empty, rows,
}: {
  title: string
  icon: typeof Clock
  empty: string
  rows: DetailRow[]
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Icon size={16} className="text-text-tertiary" /> {title}
        {rows.length > 0 && (
          <span className="ml-auto rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-tertiary">{rows.length}</span>
        )}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-4 py-4 text-center text-xs text-text-tertiary">{empty}</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={r.onClick}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-surface-elevated"
            >
              <span className="truncate text-sm text-text-primary">{r.primary}</span>
              <span className="shrink-0 text-[11px] text-text-tertiary">{r.secondary}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
