import { useEffect, useState } from 'react'
import { Mic, Plus, Loader2, Pencil, Trash2, ArrowUpRight, Sparkles, BrainCircuit, AlertTriangle, CheckCircle, CalendarDays, PenLine } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useVisits, useVisit, useDeleteVisit, type Visit } from '../hooks/use-visits.js'
import { useVisitClosure } from '../hooks/use-visit-closure.js'
import { usePendingItems } from '../hooks/use-confirmations.js'
import VisitReviewCard from '../components/confirmations/visit-review-card.js'
import { useCognitiveAudit } from '../hooks/use-cognitive-audit.js'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { post } from '../lib/api.js'
import { handleApiError } from '../lib/error-handler.js'
import { invalidateVisitRelated } from '../lib/invalidation.js'
import { entityRouteTo } from '../lib/entity-links.js'
import { useConfirmDialog } from '../hooks/use-confirm-dialog.js'
import VisitForm from '../components/forms/visit-form.js'
import VoiceVisitForm from '../components/forms/voice-visit-form.js'
import LogVisitForm from '../components/forms/log-visit-form.js'
import ClosureTracker from '../components/visits/closure-tracker.js'
import Drawer from '../components/ui/drawer.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { renderMarkdown } from '../lib/markdown.js'
import AiEntryButton from '../components/ai/ai-entry-button.js'

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

const STAGE_ORDER = ['DRAFT', 'PREPARING', 'READY', 'IN_PROGRESS', 'REVIEWING', 'CLOSED']

/** 闭环向导区：六节点进度 + 双轨评分 + 待确认即时核对（V6.1 §5.3/§6.1，V6.2 表单式确认） */
function ClosureSection({ visitId }: { visitId: string }) {
  const { data: closure, isLoading, refetch, isFetching } = useVisitClosure(visitId)
  const { data: pending } = usePendingItems({ visitId, status: 'pending' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [nodeActionBusy, setNodeActionBusy] = useState(false)

  // P2：未完成节点点击引导——AI分析就地触发复盘，确认/跟进跳到对应处理页
  const handleNodeAction = async (key: string) => {
    if (key === 'hasConfirmation') {
      navigate('/confirmations')
      return
    }
    if (key === 'hasFollowUp') {
      navigate('/tasks')
      return
    }
    if (key !== 'hasAiAnalysis') return
    setNodeActionBusy(true)
    try {
      await post('/api/visits/' + visitId + '/analyze', {})
      invalidateVisitRelated(queryClient, { visitId })
    } catch (err) {
      handleApiError(err, '分析失败')
    } finally {
      setNodeActionBusy(false)
    }
  }

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-xl bg-surface-elevated" />
  }
  if (!closure) return null

  return (
    <div className="space-y-2">
      <ClosureTracker
        closure={closure}
        onRefresh={() => refetch()}
        refreshing={isFetching || nodeActionBusy}
        actionableNodes={['hasAiAnalysis', 'hasConfirmation', 'hasFollowUp']}
        onNodeAction={handleNodeAction}
      />
      {pending && pending.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
          <p className="text-xs font-medium text-warning">
            AI 已从本次拜访提取 {pending.length} 项信息，勾掉不对的后一次确认（确认后闭环"确认"节点才完成）：
          </p>
          <div className="mt-2">
            <VisitReviewCard items={pending} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function Visits() {
  const [open, setOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Partial<Visit> | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [logVisitId, setLogVisitId] = useState<string | null>(null)
  const [auditVisit, setAuditVisit] = useState<Visit | undefined>(undefined)
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, isLoading, error } = useVisits()
  // P1：详情走独立查询，分析/闭环/复盘后随失效矩阵自动刷新
  const { data: detailItem } = useVisit(detailId)

  const visitId = searchParams.get('id')
  useEffect(() => {
    if (!visitId) return
    setDetailId(visitId)
    setSearchParams({}, { replace: true })
  }, [visitId, setSearchParams])
  const del = useDeleteVisit()
  const confirmDialog = useConfirmDialog()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { audit, isLoading: isAuditing, result: auditResult, error: auditError, reset: resetAudit } = useCognitiveAudit()

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

  const handleCloseVisit = async (id: string) => {
    setClosingId(id)
    try {
      await post<Record<string, unknown>>('/api/visits/' + id + '/close', {})
      invalidateVisitRelated(queryClient, { visitId: id })
    } catch (err) {
      handleApiError(err, '完成拜访失败')
    } finally {
      setClosingId(null)
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

  const handleAudit = async (visit: Visit) => {
    setAuditVisit(visit)
    resetAudit()
    const transcript = visit.summary || visit.audioTranscript || ''
    if (!transcript.trim()) {
      handleApiError(new Error('拜访记录没有可审计的内容（摘要或转写文本）'))
      return
    }
    try {
      await audit({
        transcript,
        projectId: visit.projectId,
        audioUrl: visit.audioUrl,
      })
    } catch {
      // error 已通过 hook 设置
    }
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
      {logVisitId && (
        <LogVisitForm visitId={logVisitId} open onClose={() => setLogVisitId(null)} />
      )}

      <Drawer open={!!detailId} onClose={() => { setDetailId(undefined); setAuditVisit(undefined); resetAudit() }} title="拜访详情">
        {detailId && !detailItem && <LoadingState />}
        {detailItem && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs text-text-tertiary">关联项目</label>
                  {detailItem.project?.name ? (
                    <button
                      onClick={() => navigate(entityRouteTo('project', detailItem.projectId))}
                      className="mt-0.5 flex items-center gap-1 text-base font-medium text-primary hover:underline"
                    >
                      {detailItem.project.name}
                      <ArrowUpRight size={14} />
                    </button>
                  ) : (
                    <p className="text-base font-medium text-text-primary">-</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {detailItem.workflowStage !== 'CLOSED' && (
                    <>
                      <button
                        onClick={() => setLogVisitId(detailItem.id)}
                        className="flex items-center gap-1 rounded-lg bg-warning px-2.5 py-1 text-xs font-medium text-white hover:bg-warning/90"
                      >
                        <PenLine size={12} />
                        录入复盘
                      </button>
                      <AiEntryButton
                        prompt={`请帮我分析这次拜访：${detailItem.summary || '无摘要'}`}
                        label="问小销"
                        variant="primary"
                        entityType="visit"
                        entityId={detailItem.id}
                      />
                      <button
                        onClick={() => handleAnalyze(detailItem.id)}
                        disabled={analyzingId === detailItem.id}
                        className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                      >
                        {analyzingId === detailItem.id ? <Loader2 size={12} className="animate-spin" /> : <BrainCircuit size={12} />}
                        AI 复盘
                      </button>
                      <button
                        onClick={() => handleAudit(detailItem)}
                        disabled={isAuditing}
                        className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-white hover:bg-secondary/90 disabled:opacity-50"
                      >
                        {isAuditing && auditVisit?.id === detailItem.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        认知审计
                      </button>
                      <button
                        onClick={() => handleCloseVisit(detailItem.id)}
                        disabled={closingId === detailItem.id}
                        className="flex items-center gap-1 rounded-lg bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
                      >
                        {closingId === detailItem.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        完成拜访
                      </button>
                    </>
                  )}
                  {detailItem.workflowStage === 'CLOSED' && (
                    <span className="rounded-lg bg-text-tertiary/10 px-2.5 py-1 text-xs font-medium text-text-tertiary">已关闭</span>
                  )}
                </div>
              </div>

            {/* Stage Progress */}
            <div className="flex items-center gap-1">
              {STAGE_ORDER.map((stage, idx) => {
                const currentIdx = STAGE_ORDER.indexOf(detailItem.workflowStage || 'DRAFT')
                const isActive = idx === currentIdx
                const isPassed = idx < currentIdx
                return (
                  <div
                    key={stage}
                    className={`flex-1 rounded py-1 text-center text-[10px] font-medium ${
                      isActive
                        ? 'bg-primary text-white'
                        : isPassed
                          ? 'bg-primary/20 text-primary'
                          : 'bg-border text-text-tertiary'
                    }`}
                  >
                    {STAGE_LABELS[stage]}
                  </div>
                )
              })}
            </div>

            {/* V6.1 闭环向导：六节点进度 + 双轨评分构成 */}
            <ClosureSection visitId={detailItem.id} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-tertiary">拜访方式</label>
                <p className="text-sm text-text-primary">
                  {detailItem.visitType === 'offline' ? '线下' : detailItem.visitType === 'online' ? '线上' : '电话'}
                </p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">拜访时间</label>
                <p className="text-sm text-text-primary">{new Date(detailItem.visitTime).toLocaleString('zh-CN')}</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-text-tertiary">拜访摘要</label>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{detailItem.summary || '-'}</p>
            </div>

            {/* AI Analysis */}
            {detailItem.aiAnalysis && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-primary">
                  <Sparkles size={14} /> AI 复盘
                </h4>
                {Boolean(detailItem.aiAnalysis.summary) && (
                  <p className="mb-2 text-xs text-text-secondary">{detailItem.aiAnalysis.summary as string}</p>
                )}
                {Boolean(detailItem.aiAnalysis.milestoneProgress) && (
                  <div className="mb-2">
                    <label className="text-xs text-text-tertiary">里程碑进展</label>
                    <p className="text-sm text-text-primary">{detailItem.aiAnalysis.milestoneProgress as string}</p>
                  </div>
                )}
                {Boolean(detailItem.aiAnalysis.sentiment) && (
                  <div className="mb-2">
                    <label className="text-xs text-text-tertiary">客户态度</label>
                    <p className="text-sm text-text-primary">{detailItem.aiAnalysis.sentiment as string}</p>
                  </div>
                )}
                {Array.isArray(detailItem.aiAnalysis.risks) && detailItem.aiAnalysis.risks.length > 0 && (
                  <div className="mb-2">
                    <label className="text-xs text-text-tertiary">风险预警</label>
                    <div className="mt-1 space-y-1">
                      {detailItem.aiAnalysis.risks.map((r: unknown, i: number) => (
                        <p key={i} className="text-xs text-warning">• {String(r)}</p>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(detailItem.aiAnalysis.nextActions) && detailItem.aiAnalysis.nextActions.length > 0 && (
                  <div>
                    <label className="text-xs text-text-tertiary">下一步行动</label>
                    <div className="mt-1 space-y-1">
                      {detailItem.aiAnalysis.nextActions.map((a: unknown, i: number) => (
                        <p key={i} className="text-xs text-text-secondary">• {typeof a === 'string' ? a : (a as Record<string, string>).action || String(a)}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cognitive Audit Result */}
            {(auditVisit?.id === detailItem.id) && (
              <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
                <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-secondary">
                  <Sparkles size={14} /> DynamicContextAgent 认知审计
                </h4>
                {auditError ? (
                  <p className="text-xs text-danger">{auditError}</p>
                ) : !auditResult ? (
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <Loader2 size={14} className="animate-spin" />
                    正在分析销售口述并落盘关键事实...
                  </div>
                ) : (
                  <div
                    className="prose prose-sm max-w-none text-sm text-text-secondary"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(auditResult) }}
                  />
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-tertiary">联系人</label>
                <p className="text-sm text-text-primary">{detailItem.contactName || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">职位</label>
                <p className="text-sm text-text-primary">{detailItem.contactPosition || '-'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-tertiary">角色</label>
                <p className="text-sm text-text-primary">{detailItem.contactRole || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">音频记录</label>
                <p className="text-sm text-text-primary">{detailItem.audioUrl ? '有' : '无'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-tertiary">创建时间</label>
                <p className="text-sm text-text-primary">{new Date(detailItem.createdAt).toLocaleString('zh-CN')}</p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">更新时间</label>
                <p className="text-sm text-text-primary">{new Date(detailItem.updatedAt).toLocaleString('zh-CN')}</p>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {confirmDialog.dialog}
    </div>
  )
}
