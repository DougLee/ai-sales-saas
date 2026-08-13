import { useMemo } from 'react'
import { CalendarClock, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useVisits, type Visit } from '../../hooks/use-visits.js'
import { upcomingVisits } from './visit-prep.utils.js'

/**
 * 工作台 · 拜访准备区（V6.1 §十 工作台升级）
 * 未来 7 天的拜访计划 + 准备状态（AI 准备素材是否已生成）
 */

function prepStateOf(visit: Visit): { label: string; className: string } {
  switch (visit.workflowStage) {
    case 'READY':
      return { label: '已就绪', className: 'bg-success/10 text-success' }
    case 'PREPARING':
      return { label: '准备中', className: 'bg-primary/10 text-primary' }
    default:
      return { label: '待准备', className: 'bg-warning/10 text-warning' }
  }
}

export function VisitPrepCard() {
  const navigate = useNavigate()
  const { data, isLoading } = useVisits()
  const upcoming = useMemo(() => upcomingVisits(data?.items || []), [data])

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
          <CalendarClock size={15} className="text-primary" />
          拜访准备
          {upcoming.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              7 天内 {upcoming.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => navigate('/visits')}
          className="flex items-center gap-0.5 text-xs text-primary hover:underline"
        >
          拜访中心 <ArrowUpRight size={12} />
        </button>
      </div>

      {isLoading && (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-elevated" />
          ))}
        </div>
      )}

      {!isLoading && upcoming.length === 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-text-tertiary">
          <CheckCircle2 size={13} className="text-success" />
          未来 7 天暂无拜访计划
        </p>
      )}

      {!isLoading && upcoming.length > 0 && (
        <div className="mt-3 space-y-2">
          {upcoming.slice(0, 4).map((v) => {
            const prep = prepStateOf(v)
            return (
              <button
                key={v.id}
                onClick={() => navigate(`/visits?id=${v.id}`)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-surface-elevated px-3 py-2 text-left hover:bg-border/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-text-primary">
                    {v.company?.name || '未关联客户'}
                    {v.project?.name && <span className="text-text-tertiary"> · {v.project.name}</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-tertiary">
                    {new Date(v.visitTime).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {v.contactName && ` · ${v.contactName}`}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${prep.className}`}>
                  {prep.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
