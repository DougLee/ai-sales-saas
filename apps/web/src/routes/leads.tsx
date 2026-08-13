import { useState, useEffect } from 'react'
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Star,
  MessageSquare,
  BrainCircuit,
  XCircle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  useLeads,
  useLead,
  useDeleteLead,
  useConvertLead,
  useLeadScore,
  useLeadAssess,
  useAssessmentJob,
  useLeadFollowUps,
  useLeadLose,
  useLeadTimeline,
  type Lead,
  type LeadFollowUp,
} from '../hooks/use-leads.js'
import { useHasRole } from '../hooks/use-permission.js'
import { useDebouncedValue } from '../hooks/use-debounced-value.js'
import { entityRouteTo } from '../lib/entity-links.js'
import LeadForm from '../components/forms/lead-form.js'
import LeadFollowUpForm from '../components/forms/lead-follow-up-form.js'
import Drawer from '../components/ui/drawer.js'
import Modal from '../components/ui/modal.js'
import AiEntryButton from '../components/ai/ai-entry-button.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { useConfirmDialog } from '../hooks/use-confirm-dialog.js'

const statusLabels: Record<string, string> = {
  NEW: '新建',
  FOLLOWING: '跟进中',
  CONVERTED: '已转化',
  LOST: '已关闭',
  PAUSED: '暂停',
}

const sourceLabels: Record<string, string> = {
  cold_call: ' cold call',
  referral: '客户推荐',
  exhibition: '展会活动',
  online: '线上推广',
  official_website: '官网咨询',
  partner: '合作伙伴',
  other: '其他',
}

const channelLabels: Record<string, string> = {
  phone: '电话',
  wechat: '微信',
  email: '邮件',
  visit: '拜访',
  other: '其他',
}

function gradeBadge(grade?: string) {
  if (grade === 'A') return 'bg-success/10 text-success'
  if (grade === 'B') return 'bg-warning/10 text-warning'
  if (grade === 'C') return 'bg-text-tertiary/10 text-text-tertiary'
  return 'bg-surface-elevated text-text-secondary'
}

function checkReadiness(lead: Lead) {
  const checks = []
  checks.push({
    label: '评分或完整度 ≥ 60',
    pass: (lead.score ?? 0) >= 60 || lead.completenessScore >= 60,
  })
  checks.push({
    label: '有效联系方式',
    pass: !!(lead.contactPhone || lead.contactEmail),
  })
  checks.push({
    label: '需求方向明确',
    pass: !!lead.businessInfo?.requirements?.trim(),
  })
  checks.push({
    label: '至少一次有效跟进',
    pass: lead.followUpCount >= 1,
  })
  checks.push({
    label: '识别关键决策人',
    pass: !!lead.humanInfo?.decisionMaker?.trim(),
  })
  checks.push({
    label: '预算信号已知',
    pass: !!(lead.financeInfo?.budget?.trim() || lead.financeInfo?.budgetSource?.trim()),
  })
  return checks
}

export default function Leads() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [open, setOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Partial<Lead> | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [searchParams, setSearchParams] = useSearchParams()
  // P1：筛选状态进 URL，刷新/分享链接不丢筛选
  const statusFilter = searchParams.get('status') || ''
  const gradeFilter = searchParams.get('grade') || ''
  const setFilterParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }
  const setStatusFilter = (v: string) => setFilterParam('status', v)
  const setGradeFilter = (v: string) => setFilterParam('grade', v)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [loseOpen, setLoseOpen] = useState(false)
  const [loseReason, setLoseReason] = useState('')
  const [assessmentJobId, setAssessmentJobId] = useState<string | undefined>(undefined)
  const [forceReason, setForceReason] = useState('')
  const [showForce, setShowForce] = useState(false)
  const navigate = useNavigate()

  const isAdmin = useHasRole('TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD')
  const { data, isLoading, error } = useLeads({ search: debouncedSearch, status: statusFilter, grade: gradeFilter })
  // P1：详情走独立查询，评分/AI评估/跟进/转化后随失效矩阵自动刷新
  const { data: detailItem } = useLead(detailId)

  const leadId = searchParams.get('id')
  useEffect(() => {
    if (!leadId) return
    setDetailId(leadId)
    setSearchParams({}, { replace: true })
  }, [leadId, setSearchParams])

  const del = useDeleteLead()
  const confirmDialog = useConfirmDialog()
  const convert = useConvertLead()
  const score = useLeadScore()
  const assess = useLeadAssess()
  const lose = useLeadLose()
  const followUps = useLeadFollowUps(detailId)
  const timeline = useLeadTimeline(detailId)
  const job = useAssessmentJob(detailId, assessmentJobId)

  const handleEdit = (lead: Lead) => {
    setEditingItem(lead)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog.confirm({
      title: '删除线索',
      description: '删除后不可恢复，确定删除这条线索吗？',
      confirmLabel: '删除',
      danger: true,
    }))) return
    del.mutate(id)
  }

  const handleConvert = async (lead: Lead, force = false) => {
    // 强制转化已有"填原因"的二次步骤，普通转化需要确认（单击即执行的防护）
    if (!force && !(await confirmDialog.confirm({
      title: '转化为商机',
      description: `确定将线索「${lead.name}」转化为商机吗？系统将自动创建对应客户与商机。`,
      confirmLabel: '转化',
    }))) return
    const res = await convert.mutateAsync({ id: lead.id, force, forceReason: force ? forceReason : undefined })
    setDetailId(undefined)
    setShowForce(false)
    setForceReason('')
    if (res?.project?.id) {
      navigate(entityRouteTo('project', res.project.id))
    }
  }

  const handleScore = (id: string) => {
    score.mutate(id)
  }

  const handleAssess = (id: string) => {
    assess.mutate(id, {
      onSuccess: (data) => {
        setAssessmentJobId(data.jobId)
      },
    })
  }

  const handleLose = async () => {
    if (!detailItem || !loseReason.trim()) return
    await lose.mutateAsync({ id: detailItem.id, lostReason: loseReason })
    setLoseOpen(false)
    setLoseReason('')
    setDetailId(undefined)
  }

  const handleClose = () => {
    setOpen(false)
    setEditingItem(undefined)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">线索管理</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索线索..."
              className="h-10 rounded-xl border border-border bg-surface px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary"
          >
            <option value="">全部状态</option>
            <option value="NEW">新建</option>
            <option value="FOLLOWING">跟进中</option>
            <option value="CONVERTED">已转化</option>
            <option value="LOST">已关闭</option>
            <option value="PAUSED">暂停</option>
          </select>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary"
          >
            <option value="">全部等级</option>
            <option value="A">A 级</option>
            <option value="B">B 级</option>
            <option value="C">C 级</option>
          </select>
          <AiEntryButton
            prompt="帮我分析当前线索池，哪些线索值得优先跟进"
            label="问小销"
            variant="primary"
            className="rounded-xl px-4 py-2 text-sm"
          />
          <button
            onClick={() => { setEditingItem(undefined); setOpen(true) }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus size={16} /> 新建线索
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <span className="text-sm text-text-tertiary">
            {isLoading ? '加载中...' : `共 ${data?.total || 0} 条线索`}
          </span>
        </div>

        {isLoading && <LoadingState />}

        {error && <ErrorState message={(error as Error).message || '加载失败'} />}

        {!isLoading && !error && data?.items.length === 0 && (
          <EmptyState
            icon={FileText}
            title="暂无线索数据"
            description="点击右上角「新建线索」开始录入"
          />
        )}

        {!isLoading && !error && data && data.items.length > 0 && (
          <div className="divide-y divide-border">
            {data.items.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between px-6 py-4 hover:bg-surface-elevated/50 transition-colors cursor-pointer" onClick={() => setDetailId(lead.id)}>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-text-primary">{lead.name}</p>
                    <p className="text-sm text-text-secondary">
                      {lead.contactName || '暂无联系人'} · {lead.contactPhone || '无电话'}
                      {lead.company?.name && <span className="ml-2 text-text-tertiary">· {lead.company.name}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {lead.grade && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${gradeBadge(lead.grade)}`}>
                        {lead.grade}级
                      </span>
                    )}
                    {lead.score != null && lead.score > 0 ? (
                      <span className="text-xs text-text-secondary">{lead.score}分</span>
                    ) : (
                      <span className="text-xs text-text-tertiary">未评分</span>
                    )}
                    {lead.followUpCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-text-secondary">
                        <MessageSquare size={12} /> {lead.followUpCount}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <AiEntryButton
                    prompt={`请帮我评估这条线索：${lead.name}，联系人 ${lead.contactName || '暂无'}，电话 ${lead.contactPhone || '暂无'}`}
                    label="问小销"
                    variant="ghost"
                    entityType="lead"
                    entityId={lead.id}
                  />
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    lead.status === 'FOLLOWING' ? 'bg-success/10 text-success' :
                    lead.status === 'NEW' ? 'bg-primary/10 text-primary' :
                    lead.status === 'CONVERTED' ? 'bg-primary/10 text-primary' :
                    lead.status === 'PAUSED' ? 'bg-warning/10 text-warning' :
                    lead.status === 'LOST' ? 'bg-danger/10 text-danger' :
                    'bg-text-tertiary/10 text-text-tertiary'
                  }`}>
                    {statusLabels[lead.status] || lead.status}
                  </span>
                  {lead.status === 'FOLLOWING' && (
                    <button
                      onClick={() => handleConvert(lead)}
                      disabled={convert.isPending}
                      className="rounded-lg p-1.5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                      title="转化为商机"
                    >
                      <ArrowRightLeft size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(lead)}
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(lead.id)}
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-danger/10 hover:text-danger transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <LeadForm open={open} onClose={handleClose} initialData={editingItem} />

      <Drawer open={!!detailId} onClose={() => setDetailId(undefined)} title="线索详情">
        {detailId && !detailItem && <LoadingState />}
        {detailItem && (
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <label className="text-xs text-text-tertiary">客户名称</label>
                <p className="text-base font-medium text-text-primary">{detailItem.name}</p>
              </div>
              <div className="flex gap-2">
                {detailItem.grade && (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${gradeBadge(detailItem.grade)}`}>
                    {detailItem.grade}级
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  detailItem.status === 'FOLLOWING' ? 'bg-success/10 text-success' :
                  detailItem.status === 'CONVERTED' ? 'bg-primary/10 text-primary' :
                  detailItem.status === 'LOST' ? 'bg-danger/10 text-danger' :
                  'bg-warning/10 text-warning'
                }`}>
                  {statusLabels[detailItem.status] || detailItem.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-tertiary">来源</label>
                <p className="text-sm text-text-primary">{sourceLabels[detailItem.source] || detailItem.source}</p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">完整度评分</label>
                <p className="text-sm text-text-primary">{detailItem.completenessScore}</p>
              </div>
            </div>

            {(detailItem.score !== undefined || detailItem.grade) && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-text-primary">综合评分</p>
                  <span className="text-xs text-text-tertiary">
                    {detailItem.assessedBy === 'AI' ? 'AI 评估' : '规则评分'} · {detailItem.assessedAt ? new Date(detailItem.assessedAt).toLocaleString('zh-CN') : '-'}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  {detailItem.score != null && detailItem.score > 0 ? (
                    <>
                      <span className="text-2xl font-bold text-text-primary">{detailItem.score}</span>
                      <span className="text-sm text-text-secondary">分</span>
                    </>
                  ) : (
                    <span className="text-lg font-medium text-text-tertiary">未评分</span>
                  )}
                  {detailItem.grade && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${gradeBadge(detailItem.grade)}`}>
                      {detailItem.grade}级
                    </span>
                  )}
                </div>
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
                <label className="text-xs text-text-tertiary">电话</label>
                <p className="text-sm text-text-primary">{detailItem.contactPhone || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">邮箱</label>
                <p className="text-sm text-text-primary">{detailItem.contactEmail || '-'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-tertiary">决策人</label>
                <p className="text-sm text-text-primary">{detailItem.humanInfo?.decisionMaker || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">需求</label>
                <p className="text-sm text-text-primary">{detailItem.businessInfo?.requirements || '-'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-tertiary">预算</label>
                <p className="text-sm text-text-primary">{detailItem.financeInfo?.budget || detailItem.financeInfo?.budgetSource || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">采购时间</label>
                <p className="text-sm text-text-primary">{detailItem.businessInfo?.timeline || '-'}</p>
              </div>
            </div>

            {detailItem.followUpCount > 0 && (
              <div>
                <label className="text-xs text-text-tertiary">跟进统计</label>
                <p className="text-sm text-text-primary">
                  {detailItem.followUpCount} 次跟进
                  {detailItem.lastFollowUpAt && ` · 最近 ${new Date(detailItem.lastFollowUpAt).toLocaleString('zh-CN')}`}
                </p>
              </div>
            )}

            <div>
              <label className="text-xs text-text-tertiary">备注</label>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{detailItem.notes || '-'}</p>
            </div>

            {detailItem.status === 'FOLLOWING' && (
              <>
                <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
                  <p className="text-sm font-medium text-text-primary">转化条件检查</p>
                  {checkReadiness(detailItem).map((check, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      {check.pass ? (
                        <CheckCircle2 size={14} className="text-success" />
                      ) : (
                        <AlertCircle size={14} className="text-warning" />
                      )}
                      <span className={check.pass ? 'text-text-secondary' : 'text-warning'}>{check.label}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleScore(detailItem.id)}
                    disabled={score.isPending}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors disabled:opacity-50"
                  >
                    <Star size={14} /> 规则评分
                  </button>
                  <button
                    onClick={() => handleAssess(detailItem.id)}
                    disabled={assess.isPending}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors disabled:opacity-50"
                  >
                    <BrainCircuit size={14} /> AI 评估
                  </button>
                  <button
                    onClick={() => setFollowUpOpen(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
                  >
                    <MessageSquare size={14} /> 记录跟进
                  </button>
                  <button
                    onClick={() => setLoseOpen(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
                  >
                    <XCircle size={14} /> 标记流失
                  </button>
                </div>

                {assessmentJobId && job.data && (
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <RefreshCw size={14} className={job.data.status === 'running' || job.data.status === 'pending' ? 'animate-spin text-primary' : 'text-text-secondary'} />
                      <span className="text-text-secondary">
                        AI 评估：{job.data.status === 'pending' ? '排队中' : job.data.status === 'running' ? '评估中' : job.data.status === 'completed' ? `完成 ${job.data.score ?? ''}分 ${job.data.grade ?? ''}级` : `失败 ${job.data.error ?? ''}`}
                      </span>
                    </div>
                  </div>
                )}

                {showForce ? (
                  <div className="space-y-2">
                    <textarea
                      value={forceReason}
                      onChange={(e) => setForceReason(e.target.value)}
                      placeholder="强制转化原因（必填）"
                      className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowForce(false); setForceReason('') }}
                        className="flex-1 rounded-xl border border-border bg-surface px-4 py-2 text-sm text-text-secondary hover:bg-surface-elevated"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => handleConvert(detailItem, true)}
                        disabled={convert.isPending || !forceReason.trim()}
                        className="flex-1 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50"
                      >
                        {convert.isPending ? '转化中...' : '确认强制转化'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleConvert(detailItem)}
                    disabled={convert.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {convert.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ArrowRightLeft size={16} />
                    )}
                    {convert.isPending ? '转化中...' : '转化为商机'}
                  </button>
                )}
                {!showForce && isAdmin && (
                  <button
                    onClick={() => setShowForce(true)}
                    className="w-full text-center text-xs text-text-tertiary hover:text-text-secondary"
                  >
                    管理员强制转化
                  </button>
                )}
              </>
            )}

            {detailItem.status === 'CONVERTED' && detailItem.convertedProjectId && (
              <button
                onClick={() => navigate(entityRouteTo('project', detailItem.convertedProjectId!))}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
              >
                <ArrowRightLeft size={16} />
                查看关联商机
              </button>
            )}

            {detailItem.status === 'LOST' && detailItem.lostReason && (
              <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
                <p className="text-sm font-medium text-danger">流失原因</p>
                <p className="mt-1 text-sm text-text-secondary">{detailItem.lostReason}</p>
              </div>
            )}

            {/* 跟进记录 */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-text-primary mb-3">跟进记录</p>
              {followUps.isLoading ? (
                <Loader2 size={16} className="animate-spin text-primary" />
              ) : followUps.data?.length === 0 ? (
                <p className="text-sm text-text-tertiary">暂无跟进记录</p>
              ) : (
                <div className="space-y-3">
                  {followUps.data?.map((fu: LeadFollowUp) => (
                    <div key={fu.id} className="rounded-xl border border-border bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-primary">{channelLabels[fu.channel] || fu.channel}</span>
                        <span className="text-xs text-text-tertiary">{new Date(fu.createdAt).toLocaleString('zh-CN')}</span>
                      </div>
                      <p className="mt-2 text-sm text-text-primary">{fu.content}</p>
                      {fu.outcome && (
                        <p className="mt-1 text-sm text-text-secondary">反馈：{fu.outcome}</p>
                      )}
                      {fu.nextAction && (
                        <p className="mt-1 text-xs text-text-tertiary">下一步：{fu.nextAction}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 时间线 */}
            {timeline.data && timeline.data.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-text-primary mb-3">关键事件</p>
                <div className="space-y-2">
                  {timeline.data.map((event: Record<string, unknown>, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                      <div>
                        <p className="text-text-primary">{event.eventType as string}</p>
                        <p className="text-xs text-text-tertiary">{new Date(event.eventTime as string).toLocaleString('zh-CN')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {detailItem && (
        <LeadFollowUpForm
          open={followUpOpen}
          onClose={() => setFollowUpOpen(false)}
          leadId={detailItem.id}
        />
      )}

      {loseOpen && detailItem && (
        <Modal open={loseOpen} onClose={() => setLoseOpen(false)} title="标记线索流失">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">流失原因 *</label>
              <textarea
                value={loseReason}
                onChange={(e) => setLoseReason(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                placeholder="如：预算取消、选择竞品、长期无响应..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLoseOpen(false)}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated"
              >
                取消
              </button>
              <button
                onClick={handleLose}
                disabled={lose.isPending || !loseReason.trim()}
                className="rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {lose.isPending ? '保存中...' : '确认'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDialog.dialog}
    </div>
  )
}
