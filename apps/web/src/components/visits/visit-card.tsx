import { AlertTriangle, ArrowRight, BrainCircuit, Loader2, Pencil, Trash2 } from 'lucide-react'
import type { Visit } from '../../hooks/use-visits.js'
import { cn } from '../../lib/utils.js'
import AiEntryButton from '../ai/ai-entry-button.js'
import { StatusPill, type PillTone } from '../ui/status-pill.js'
import { nextActionDeadlineState } from './visit-funnel.utils.js'

const STAGE_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PREPARING: '准备中',
  READY: '就绪',
  IN_PROGRESS: '进行中',
  REVIEWING: '复盘',
  CLOSED: '已关闭',
}

const STAGE_TONES: Record<string, PillTone> = {
  DRAFT: 'neutral',
  PREPARING: 'primary',
  READY: 'success',
  IN_PROGRESS: 'warning',
  REVIEWING: 'warning',
  CLOSED: 'neutral',
}

const VISIT_TYPE_TONES: Record<string, PillTone> = {
  offline: 'primary',
  online: 'success',
  phone: 'warning',
}

/** 下一步截止日：逾期红 / 今天橙 / 以后灰 */
function deadlineCls(state: ReturnType<typeof nextActionDeadlineState>): string {
  if (state === 'overdue') return 'bg-danger/10 text-danger'
  if (state === 'today') return 'bg-warning/10 text-warning'
  return 'bg-surface-elevated text-text-tertiary'
}

function deadlineText(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} 截止`
}

export interface VisitCardProps {
  visit: Visit
  /** 待复盘置顶区：警示底色 + 操作常显（时间线区的操作 hover 才现） */
  reviewing?: boolean
  analyzing?: boolean
  onAnalyze: (id: string) => void
  onEdit: (visit: Visit) => void
  onDelete: (id: string) => void
  onDetail: (id: string) => void
  /** 断头拜访的补录入口（打开复盘录入表单） */
  onLogVisit: (id: string) => void
}

/**
 * 拜访卡片（issue #41 A3/A4）：
 * - 下一步行动条是卡片灵魂：绿条 = 有下一步；橙条 = 断头拜访警示 + 补录入口
 * - 操作（问小销/复盘/编辑/删除）hover 才现，待复盘区例外常显
 */
export default function VisitCard({
  visit,
  reviewing = false,
  analyzing = false,
  onAnalyze,
  onEdit,
  onDelete,
  onDetail,
  onLogVisit,
}: VisitCardProps) {
  const hasNext = !!visit.nextAction?.trim()
  const deadlineState = nextActionDeadlineState(visit.nextActionDeadline)
  const stage = visit.workflowStage || 'DRAFT'

  return (
    <div
      onClick={() => onDetail(visit.id)}
      className={cn(
        'group cursor-pointer rounded-card border bg-surface p-4 transition-colors',
        reviewing
          ? 'border-warning/50 bg-warning/[0.04] hover:border-warning'
          : 'border-border hover:border-primary/30',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-text-primary">
              {visit.company?.name || (
                <span className="inline-flex items-center gap-1 text-warning">
                  <AlertTriangle size={14} /> 未关联客户
                </span>
              )}
            </p>
            <StatusPill tone={STAGE_TONES[stage] ?? 'neutral'}>{STAGE_LABELS[stage] || stage}</StatusPill>
            <StatusPill tone={VISIT_TYPE_TONES[visit.visitType] ?? 'neutral'}>
              {visit.visitType === 'offline' ? '线下' : visit.visitType === 'online' ? '线上' : '电话'}
            </StatusPill>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
            {visit.summary || '无摘要'}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-tertiary">
            <span>{new Date(visit.visitTime).toLocaleString('zh-CN')}</span>
            {visit.project?.name && <span>商机：{visit.project.name}</span>}
            {visit.contactName && <span>联系人：{visit.contactName}</span>}
          </p>
        </div>

        {/* 操作区：时间线卡 hover 才现；待复盘区常显（复盘完才许沉底） */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex shrink-0 items-center gap-2 transition-opacity',
            reviewing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          <AiEntryButton
            prompt={`请帮我分析这次拜访：${visit.summary || '无摘要'}`}
            label="问小销"
            variant="ghost"
            entityType="visit"
            entityId={visit.id}
          />
          <button
            onClick={() => onAnalyze(visit.id)}
            disabled={analyzing}
            className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
            title="AI 复盘"
          >
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
          </button>
          <button
            onClick={() => onEdit(visit)}
            className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary"
            title="编辑"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(visit.id)}
            className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* 下一步行动条 = 卡片灵魂 */}
      {hasNext ? (
        <div className="mt-3 flex items-center gap-2 rounded-inner border border-success/30 bg-success/10 px-3 py-2">
          <ArrowRight size={14} className="shrink-0 text-success" aria-hidden />
          <span className="text-xs font-medium text-text-primary">
            下一步：<span className="font-normal">{visit.nextAction}</span>
          </span>
          {visit.nextActionDeadline && deadlineState && (
            <span
              className={cn(
                'ml-auto shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                deadlineCls(deadlineState),
              )}
            >
              {deadlineState === 'overdue' ? '已逾期 · ' : ''}
              {deadlineText(visit.nextActionDeadline)}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-inner border border-warning/40 bg-warning/10 px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 text-warning" aria-hidden />
          <span className="text-xs font-medium text-warning">断头拜访 · 未留下一步行动</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onLogVisit(visit.id)
            }}
            className="ml-auto shrink-0 rounded-lg border border-warning/50 px-2 py-1 text-[11px] font-medium text-warning transition-colors hover:bg-warning/15"
          >
            补录下一步
          </button>
        </div>
      )}
    </div>
  )
}
