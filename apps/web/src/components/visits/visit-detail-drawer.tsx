import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Sparkles, BrainCircuit, Loader2, CheckCircle, PenLine } from 'lucide-react'
import { useVisit, type Visit } from '../../hooks/use-visits.js'
import { useVisitClosure } from '../../hooks/use-visit-closure.js'
import { usePendingItems } from '../../hooks/use-confirmations.js'
import VisitReviewCard from '../confirmations/visit-review-card.js'
import { useCognitiveAudit } from '../../hooks/use-cognitive-audit.js'
import { post } from '../../lib/api.js'
import { handleApiError } from '../../lib/error-handler.js'
import { invalidateVisitRelated } from '../../lib/invalidation.js'
import { entityRouteTo } from '../../lib/entity-links.js'
import { renderMarkdown } from '../../lib/markdown.js'
import AiEntryButton from '../ai/ai-entry-button.js'
import ClosureTracker from '../visits/closure-tracker.js'
import LogVisitForm from '../forms/log-visit-form.js'
import Drawer from '../ui/drawer.js'
import { LoadingState } from '../ui/states.js'

const STAGE_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PREPARING: '准备中',
  READY: '就绪',
  IN_PROGRESS: '进行中',
  REVIEWING: '复盘',
  CLOSED: '已关闭',
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

interface VisitDetailDrawerProps {
  visitId: string | undefined
  onClose: () => void
}

/**
 * 拜访详情抽屉（共享组件）：visits / projects / customers 三处复用。
 * 父级始终渲染本组件，靠 open={!!visitId} 门控；useVisit(undefined) 自带 enabled:false。
 */
export default function VisitDetailDrawer({ visitId, onClose }: VisitDetailDrawerProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: detailItem } = useVisit(visitId)
  const { audit, isLoading: isAuditing, result: auditResult, error: auditError, reset: resetAudit } = useCognitiveAudit()

  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [logVisitId, setLogVisitId] = useState<string | null>(null)
  const [auditVisit, setAuditVisit] = useState<Visit | undefined>(undefined)

  // 切换到另一条拜访时，清掉上一条的审计/复盘草稿状态，避免串扰
  useEffect(() => {
    if (!visitId) return
    resetAudit()
    setAuditVisit(undefined)
    setLogVisitId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId])

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

  const handleClose = () => {
    resetAudit()
    setAuditVisit(undefined)
    setLogVisitId(null)
    onClose()
  }

  return (
    <>
      <Drawer open={!!visitId} onClose={handleClose} title="拜访详情" width="32rem">
        {visitId && !detailItem && <LoadingState />}
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

      {logVisitId && (
        <LogVisitForm visitId={logVisitId} open onClose={() => setLogVisitId(null)} />
      )}
    </>
  )
}
