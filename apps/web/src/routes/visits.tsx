import { useEffect, useMemo, useState } from 'react'
import { Mic, Plus, CalendarDays, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useVisits, useDeleteVisit, type Visit } from '../hooks/use-visits.js'
import { useSearchParams } from 'react-router-dom'
import { post } from '../lib/api.js'
import { handleApiError } from '../lib/error-handler.js'
import { invalidateVisitRelated } from '../lib/invalidation.js'
import { useConfirmDialog } from '../hooks/use-confirm-dialog.js'
import VisitForm from '../components/forms/visit-form.js'
import VoiceVisitForm from '../components/forms/voice-visit-form.js'
import LogVisitForm from '../components/forms/log-visit-form.js'
import AiEntryButton from '../components/ai/ai-entry-button.js'
import VisitDetailDrawer from '../components/visits/visit-detail-drawer.js'
import VisitCard from '../components/visits/visit-card.js'
import { VisitStatsBar } from '../components/visits/visit-stats-bar.js'
import {
  groupVisitTimeline,
  matchVisitFilter,
  splitByReviewing,
  visitStats,
  type VisitFilterKey,
} from '../components/visits/visit-funnel.utils.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { PageHeader } from '../components/ui/page-header.js'
import { StatusPill } from '../components/ui/status-pill.js'

/**
 * 拜访中心（issue #41 A：从流水到价值漏斗）：
 * 统计条即筛选器 → 待复盘置顶（警示边框）→ 本周按天时间线 → 更早折叠。
 */
export default function Visits() {
  const [open, setOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Partial<Visit> | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<VisitFilterKey>('all')
  const [earlierOpen, setEarlierOpen] = useState(false)
  const [logVisitId, setLogVisitId] = useState<string | null>(null)
  const { data, isLoading, error } = useVisits()

  const visitId = searchParams.get('id')
  useEffect(() => {
    if (!visitId) return
    setDetailId(visitId)
    setSearchParams({}, { replace: true })
  }, [visitId, setSearchParams])
  const del = useDeleteVisit()
  const confirmDialog = useConfirmDialog()
  const queryClient = useQueryClient()

  const items = useMemo(() => data?.items || [], [data])
  const stats = useMemo(() => visitStats(items), [items])
  const filtered = useMemo(
    () => items.filter((v) => matchVisitFilter(v, filter)),
    [items, filter],
  )
  const { reviewing, rest } = useMemo(() => splitByReviewing(filtered), [filtered])
  const timeline = useMemo(() => groupVisitTimeline(rest), [rest])

  const handleAnalyze = async (id: string) => {
    setAnalyzingId(id)
    try {
      await post('/api/visits/' + id + '/analyze', {})
      invalidateVisitRelated(queryClient, { visitId: id })
    } catch (err) {
      handleApiError(err, '分析失败')
    } finally {
      setAnalyzingId(null)
    }
  }

  const handleEdit = (visit: Visit) => {
    setEditingItem(visit)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog.confirm({
      title: '删除拜访记录',
      description: '删除后不可恢复，确定删除这条拜访记录吗？',
      confirmLabel: '删除',
      danger: true,
    }))) return
    del.mutate(id)
  }

  const handleClose = () => {
    setOpen(false)
    setEditingItem(undefined)
  }

  const renderCard = (visit: Visit, opts?: { reviewing?: boolean }) => (
    <VisitCard
      key={visit.id}
      visit={visit}
      reviewing={opts?.reviewing}
      analyzing={analyzingId === visit.id}
      onAnalyze={handleAnalyze}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onDetail={setDetailId}
      onLogVisit={setLogVisitId}
    />
  )

  const hasData = !isLoading && !error && items.length > 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="拜访记录"
        subtitle="语音或手动录入，AI 自动提取关键信息"
        actions={
          <>
            {/* 层级三定律：一屏一个主行动（手动录入 primary 蓝），语音录入降为描边次行动 */}
            <button
              onClick={() => setVoiceOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-success/40 px-4 py-2 text-sm font-medium text-success transition-colors hover:bg-success/10"
            >
              <Mic size={16} /> 语音录入
            </button>
            <AiEntryButton
              prompt="帮我准备下次拜访"
              label="AI准备"
              variant="primary"
              className="rounded-xl px-4 py-2 text-sm"
            />
            <button
              onClick={() => { setEditingItem(undefined); setOpen(true) }}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Plus size={16} /> 手动录入
            </button>
          </>
        }
      />

      {isLoading && <LoadingState />}

      {error && <ErrorState message={(error as Error).message || '加载失败'} />}

      {!isLoading && !error && items.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="暂无拜访记录"
          description="使用语音录入，AI 自动提取关键信息"
        />
      )}

      {hasData && (
        <>
          {/* 统计条即筛选器：4 数字可点，再点一次取消 */}
          <VisitStatsBar stats={stats} active={filter} onChange={setFilter} />

          {/* 待复盘置顶区：价值未兑现的拜访不许沉底，操作常显 */}
          {reviewing.length > 0 && (
            <section className="space-y-2" data-testid="visits-reviewing-section">
              <div className="flex items-center gap-2 px-1">
                <RotateCcw size={14} className="text-warning" aria-hidden />
                <h2 className="text-sm font-semibold text-text-primary">待复盘</h2>
                <StatusPill tone="warning">{reviewing.length} 条</StatusPill>
                <span className="text-xs text-text-tertiary">复盘完才许沉底</span>
                <div className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <div className="space-y-3">
                {reviewing.map((visit) => renderCard(visit, { reviewing: true }))}
              </div>
            </section>
          )}

          {/* 本周按天时间线 */}
          {timeline.days.map((day) => (
            <section key={day.key} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-xs font-semibold text-text-secondary">{day.label}</h3>
                <span className="text-[11px] tabular-nums text-text-tertiary">{day.visits.length} 条</span>
                <div className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <div className="space-y-3">
                {day.visits.map((visit) => renderCard(visit))}
              </div>
            </section>
          ))}

          {/* 更早：默认折叠 */}
          {timeline.earlier.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setEarlierOpen((o) => !o)}
                aria-expanded={earlierOpen}
                className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-left transition-colors hover:border-primary/30"
              >
                {earlierOpen ? (
                  <ChevronDown size={14} className="text-text-tertiary" />
                ) : (
                  <ChevronRight size={14} className="text-text-tertiary" />
                )}
                <span className="text-sm font-medium text-text-secondary">更早</span>
                <span className="text-xs tabular-nums text-text-tertiary">{timeline.earlier.length} 条</span>
              </button>
              {earlierOpen && (
                <div className="mt-3 space-y-3">
                  {timeline.earlier.map((visit) => renderCard(visit))}
                </div>
              )}
            </section>
          )}

          {/* 筛选无结果 */}
          {filtered.length === 0 && (
            <EmptyState
              compact
              icon={CalendarDays}
              title="没有符合条件的拜访"
              description="换个筛选条件试试"
              action={
                filter !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
                  >
                    清除筛选
                  </button>
                ) : undefined
              }
            />
          )}
        </>
      )}

      <VisitForm open={open} onClose={handleClose} initialData={editingItem} />
      <VoiceVisitForm open={voiceOpen} onClose={() => setVoiceOpen(false)} />
      {/* 断头拜访的补录入口：复盘录入（含下一步行动） */}
      {logVisitId && (
        <LogVisitForm visitId={logVisitId} open onClose={() => setLogVisitId(null)} />
      )}

      <VisitDetailDrawer visitId={detailId} onClose={() => setDetailId(undefined)} />

      {confirmDialog.dialog}
    </div>
  )
}
