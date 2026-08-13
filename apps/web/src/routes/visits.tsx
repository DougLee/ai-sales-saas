import { useEffect, useState } from 'react'
import { Mic, Plus, Loader2, Pencil, Trash2, BrainCircuit, AlertTriangle, CalendarDays } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useVisits, useDeleteVisit, type Visit } from '../hooks/use-visits.js'
import { useSearchParams } from 'react-router-dom'
import { post } from '../lib/api.js'
import { handleApiError } from '../lib/error-handler.js'
import { invalidateVisitRelated } from '../lib/invalidation.js'
import { useConfirmDialog } from '../hooks/use-confirm-dialog.js'
import VisitForm from '../components/forms/visit-form.js'
import VoiceVisitForm from '../components/forms/voice-visit-form.js'
import AiEntryButton from '../components/ai/ai-entry-button.js'
import VisitDetailDrawer from '../components/visits/visit-detail-drawer.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'

const STAGE_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PREPARING: '准备中',
  READY: '就绪',
  IN_PROGRESS: '进行中',
  REVIEWING: '复盘',
  CLOSED: '已关闭',
}

const STAGE_COLORS: Record<string, string> = {
  DRAFT: 'bg-text-tertiary/10 text-text-tertiary',
  PREPARING: 'bg-primary/10 text-primary',
  READY: 'bg-success/10 text-success',
  IN_PROGRESS: 'bg-warning/10 text-warning',
  REVIEWING: 'bg-secondary/10 text-secondary',
  CLOSED: 'bg-text-tertiary/10 text-text-tertiary',
}

export default function Visits() {
  const [open, setOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Partial<Visit> | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">拜访记录</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setVoiceOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success/90"
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
        </div>
      </div>

      {isLoading && <LoadingState />}

      {error && <ErrorState message={(error as Error).message || '加载失败'} />}

      {!isLoading && !error && data?.items.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="暂无拜访记录"
          description="使用语音录入，AI 自动提取关键信息"
        />
      )}

      {!isLoading && !error && data && data.items.length > 0 && (
        <div className="space-y-3">
          {data.items.map((visit) => (
            <div
              key={visit.id}
              className="rounded-2xl border border-border bg-surface p-5 hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => setDetailId(visit.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-text-primary">
                    {visit.company?.name || (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <AlertTriangle size={14} /> 未关联客户
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {visit.summary || '无摘要'}
                    {visit.project?.name && <span className="ml-2 text-text-tertiary">· {visit.project.name}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <AiEntryButton
                    prompt={`请帮我分析这次拜访：${visit.summary || '无摘要'}`}
                    label="问小销"
                    variant="ghost"
                    entityType="visit"
                    entityId={visit.id}
                  />
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STAGE_COLORS[visit.workflowStage || 'DRAFT']}`}>
                    {STAGE_LABELS[visit.workflowStage || 'DRAFT']}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      visit.visitType === 'offline'
                        ? 'bg-primary/10 text-primary'
                        : visit.visitType === 'online'
                          ? 'bg-success/10 text-success'
                          : 'bg-warning/10 text-warning'
                    }`}
                  >
                    {visit.visitType === 'offline' ? '线下' : visit.visitType === 'online' ? '线上' : '电话'}
                  </span>
                  <button
                    onClick={() => handleAnalyze(visit.id)}
                    disabled={analyzingId === visit.id}
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                    title="AI 复盘"
                  >
                    {analyzingId === visit.id ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
                  </button>
                  <button
                    onClick={() => handleEdit(visit)}
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(visit.id)}
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-danger/10 hover:text-danger transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-text-tertiary">
                <span>{new Date(visit.visitTime).toLocaleString('zh-CN')}</span>
                {visit.contactName && <span>联系人：{visit.contactName}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <VisitForm open={open} onClose={handleClose} initialData={editingItem} />
      <VoiceVisitForm open={voiceOpen} onClose={() => setVoiceOpen(false)} />

      <VisitDetailDrawer visitId={detailId} onClose={() => setDetailId(undefined)} />

      {confirmDialog.dialog}
    </div>
  )
}
