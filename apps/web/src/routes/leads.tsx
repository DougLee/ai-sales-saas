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
  Search,
  AlertTriangle,
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
  useLeadMetrics,
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
  visit_discovery: '拜访发现',
  ai_collected: '小销收集',
  cold_call: '电话开发',
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
  // ADR-0002 决策 1：预算信号为软提示（见转化弹窗），不再计入硬性检查
  return checks
}

/** ADR-0002：转化门禁 5 条 + 预算软提示（与后端 checkConversionReadiness 同口径） */
function checkConvertReadiness(lead: Lead): string[] {
  const missing: string[] = []
  if ((lead.score ?? 0) < 60 && lead.completenessScore < 60) {
    missing.push('评分或完整度需达到 60 分以上')
  }
  if (!lead.contactPhone && !lead.contactEmail) {
    missing.push('至少需要一个有效联系方式（电话或邮箱）')
  }
  if (!lead.businessInfo?.requirements?.trim()) {
    missing.push('事：需求方向需明确')
  }
  if (lead.followUpCount < 1) {
    missing.push('至少完成一次有效跟进')
  }
  if (!lead.humanInfo?.decisionMaker?.trim()) {
    missing.push('人：需识别决策链中的关键角色')
  }
  return missing
}

export default function Leads() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [open, setOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Partial<Lead> | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [searchParams, setSearchParams] = useSearchParams()
  // P1：筛选状态进 URL；页签（ADR-0002 设计稿）：跟进中/可转化/培育中/已转化/已流失
  const tab = searchParams.get('tab') || 'following'
  const gradeFilter = searchParams.get('grade') || ''
  const sourceFilter = searchParams.get('source') || ''
  const [page, setPage] = useState(1)
  const setFilterParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }
  const setStatusFilter = (v: string) => setFilterParam('tab', v)
  const setGradeFilter = (v: string) => setFilterParam('grade', v)
  const setSourceFilter = (v: string) => setFilterParam('source', v)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [loseOpen, setLoseOpen] = useState(false)
  const [loseReason, setLoseReason] = useState('')
  const [assessmentJobId, setAssessmentJobId] = useState<string | undefined>(undefined)
  const [forceReason, setForceReason] = useState('')
  const [showForce, setShowForce] = useState(false)
  const [convertBlockOpen, setConvertBlockOpen] = useState(false)
  const [convertBlockReasons, setConvertBlockReasons] = useState<string[]>([])
  const navigate = useNavigate()

  const isAdmin = useHasRole('TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD')
  const { data, isLoading, error } = useLeads({
    search: debouncedSearch,
    status: tab === 'following' ? 'FOLLOWING' : tab === 'converted' ? 'CONVERTED' : tab === 'lost' ? 'LOST' : undefined,
    statusIn: tab === 'nurturing' ? 'NEW,PAUSED' : undefined,
    ready: tab === 'convertible' ? 'true' : undefined,
    grade: gradeFilter || undefined,
    source: sourceFilter || undefined,
    page,
  })
  const { data: metrics } = useLeadMetrics()
  // P1：详情走独立查询，评分/AI评估/跟进/转化后随失效矩阵自动刷新
  const { data: detailItem } = useLead(detailId)

  // 切页签/筛选回第一页
  useEffect(() => { setPage(1) }, [tab, gradeFilter, sourceFilter, debouncedSearch])

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
    const missing = checkConvertReadiness(lead)
    if (missing.length > 0) {
      setConvertBlockReasons(missing)
      setConvertBlockOpen(true)
      return
    }
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
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-text-primary">线索管理</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">L1 · 机会信号层</span>
        </div>
        <div className="flex items-center gap-2">
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

      {/* 页签：状态即视图，可转化绿字突出 */}
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { key: 'following', label: '跟进中', cnt: metrics?.counts.following, hot: false },
          { key: 'convertible', label: '可转化', cnt: metrics?.counts.convertible, hot: true },
          { key: 'nurturing', label: '培育中', cnt: metrics?.counts.nurturing, hot: false },
          { key: 'converted', label: '已转化', cnt: metrics?.counts.converted, hot: false },
          { key: 'lost', label: '已流失', cnt: metrics?.counts.lost, hot: false },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
              t.hot && (t.cnt ?? 0) > 0
                ? 'bg-success/15 font-bold text-success'
                : tab === t.key ? 'bg-primary/10 text-primary' : 'bg-surface-elevated text-text-tertiary'
            }`}>
              {t.cnt ?? '-'}
            </span>
          </button>
        ))}
      </div>

      {/* 指标条（L1 专属） */}
      {metrics && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xl font-bold text-text-primary">
              {metrics.following}
              {metrics.weeklyNew > 0 && <span className="ml-1.5 text-[11px] font-medium text-success">本周 +{metrics.weeklyNew}</span>}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">跟进中线索</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xl font-bold text-[#d97706]">{metrics.gradeA}</p>
            <p className="mt-0.5 text-xs text-text-secondary">A 级（本周必跟）</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xl font-bold text-success">{metrics.convertible}</p>
            <p className="mt-0.5 text-xs text-text-secondary">已过转化门禁，待转商机</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className={`text-xl font-bold ${metrics.aging > 0 ? 'text-warning' : 'text-text-primary'}`}>{metrics.aging}</p>
            <p className="mt-0.5 text-xs text-text-secondary">老化预警（超期未跟进）</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xl font-bold text-text-primary">{metrics.conversionRate2}%</p>
            <p className="mt-0.5 text-xs text-text-secondary">转化率②（线索 → 商机，本月）</p>
          </div>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索线索名称 / 联系人"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
          />
        </div>
        {(['A', 'B', 'C'] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGradeFilter(gradeFilter === g ? '' : g)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              gradeFilter === g
                ? g === 'A' ? 'border-[#f59e0b] bg-[#fef3c7] font-bold text-[#92400e]'
                  : g === 'B' ? 'border-[#3b82f6] bg-[#dbeafe] font-bold text-[#1d4ed8]'
                  : 'border-border bg-surface-elevated font-bold text-text-secondary'
                : 'border-border bg-surface text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {g} 级
          </button>
        ))}
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary outline-none focus:border-primary cursor-pointer" title="来源">
          <option value="">来源：全部</option>
          <option value="visit_discovery">拜访发现</option>
          <option value="cold_call">电话开发</option>
          <option value="referral">转介绍</option>
          <option value="exhibition">展会活动</option>
          <option value="official_website">官网咨询</option>
          <option value="ai_collected">小销收集</option>
          <option value="partner">合作伙伴</option>
        </select>
      </div>

      {/* 数据表 */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-elevated/60 text-left text-xs font-medium text-text-secondary">
                <th className="px-3 py-2.5">线索 / 所属客户</th>
                <th className="px-3 py-2.5">质量分</th>
                <th className="px-3 py-2.5">四要素</th>
                <th className="px-3 py-2.5">联系人</th>
                <th className="px-3 py-2.5">7 步进度</th>
                <th className="px-3 py-2.5">转化门禁</th>
                <th className="px-3 py-2.5">最近跟进</th>
                <th className="px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((lead) => {
                const d = lead.derivation
                const ready = d?.gate.passed === d?.gate.total
                return (
                  <tr
                    key={lead.id}
                    className={`border-b border-border/60 transition-colors last:border-0 hover:bg-primary/[0.03] ${
                      ready && lead.status === 'FOLLOWING' ? 'bg-success/[0.04]' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <button onClick={() => setDetailId(lead.id)} className="text-left font-medium text-primary hover:underline">
                        {lead.name}
                      </button>
                      <p className="text-[11px] text-text-tertiary">
                        {lead.company?.name || '无关联客户'} · {sourceLabels[lead.source] || lead.source}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-base font-extrabold ${
                        lead.grade === 'A' ? 'text-[#d97706]' : lead.grade === 'B' ? 'text-primary' : 'text-text-tertiary'
                      }`}>
                        {lead.score ?? '-'}
                      </span>
                      {lead.grade && (
                        <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          lead.grade === 'A' ? 'bg-[#fef3c7] text-[#92400e]' : lead.grade === 'B' ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-surface-elevated text-text-tertiary'
                        }`}>{lead.grade}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-0.5" title="四要素：人 / 事 / 财 / 决策链">
                        {d ? ([
                          ['人', d.fourElements.person],
                          ['事', d.fourElements.business],
                          ['财', d.fourElements.finance],
                          ['决', d.fourElements.decisionChain],
                        ] as const).map(([label, st]) => (
                          <i
                            key={label}
                            className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${
                              st === 'ready' ? 'bg-success text-white'
                              : st === 'partial' ? 'bg-warning/80 text-white'
                              : 'bg-border text-text-tertiary'
                            }`}
                          >
                            {label}
                          </i>
                        )) : <span className="text-[11px] text-text-tertiary">-</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {lead.contactName ? (
                        <>
                          <p className="text-xs text-text-primary">{lead.contactName}</p>
                          {lead.contactPosition && <p className="text-[11px] text-text-tertiary">{lead.contactPosition}</p>}
                        </>
                      ) : (
                        <span className="text-[11px] text-text-tertiary">待补充</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {d && (
                        <>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 7 }, (_, i) => (
                              <i
                                key={i}
                                className={`h-1.5 w-2 rounded-sm ${
                                  i + 1 < d.currentStep.step ? 'bg-primary'
                                  : i + 1 === d.currentStep.step ? 'bg-primary ring-2 ring-primary/25'
                                  : 'bg-border'
                                }`}
                              />
                            ))}
                          </div>
                          <p className="mt-0.5 text-[11px] text-text-tertiary">Step {d.currentStep.step} · {d.currentStep.label}</p>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {d && (
                        <>
                          <p className={`text-xs font-bold ${ready ? 'text-success' : 'text-text-tertiary font-normal'}`}>
                            {d.gate.passed}/{d.gate.total}{ready ? ' · 达标' : ''}
                          </p>
                          {!ready && d.gate.missing.length > 0 && (
                            <p className="max-w-[160px] truncate text-[11px] text-text-tertiary" title={d.gate.missing.join('；')}>
                              缺：{d.gate.missing.map((m) => m.replace(/（.*$/, '')).join('、')}
                            </p>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs text-text-secondary">
                        {lead.followUpCount > 0 ? `${lead.followUpCount} 次跟进` : '未跟进'}
                        {lead.lastFollowUpAt && ` · ${new Date(lead.lastFollowUpAt).toLocaleDateString('zh-CN')}`}
                      </p>
                      {d?.aging === 'overdue' && <p className="flex items-center gap-0.5 text-[11px] text-danger"><AlertTriangle size={10} /> 超期未跟进</p>}
                      {d?.aging === 'warning' && <p className="flex items-center gap-0.5 text-[11px] text-warning"><AlertTriangle size={10} /> 临近老化</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {ready && lead.status === 'FOLLOWING' ? (
                          <button
                            onClick={() => handleConvert(lead)}
                            disabled={convert.isPending}
                            className="rounded-md bg-success px-2 py-0.5 text-xs font-semibold text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                          >
                            转商机
                          </button>
                        ) : lead.status === 'FOLLOWING' ? (
                          <button
                            onClick={() => { setDetailId(lead.id); setFollowUpOpen(true) }}
                            className="text-xs text-primary hover:underline"
                          >
                            跟进
                          </button>
                        ) : null}
                        <AiEntryButton
                          prompt={`请帮我评估这条线索：${lead.name}，联系人 ${lead.contactName || '暂无'}，当前评分 ${lead.score ?? '未评'}`}
                          label="AI 评估"
                          variant="ghost"
                          entityType="lead"
                          entityId={lead.id}
                        />
                        <button onClick={() => setDetailId(lead.id)} className="text-xs text-primary hover:underline">详情</button>
                        <button
                          onClick={() => handleEdit(lead)}
                          className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary"
                          title="编辑线索"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
                          title="删除线索"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {isLoading && <LoadingState />}
        {error && <ErrorState message={(error as Error).message || '加载失败'} />}
        {!isLoading && !error && data?.items.length === 0 && (
          <EmptyState
            icon={FileText}
            title={tab === 'convertible' ? '暂无可转化线索' : '暂无线索数据'}
            description={tab === 'convertible' ? '门禁 5/5 的线索会出现在这里——按四要素短板补齐即可' : '点击右上角「新建线索」，或从目标客户池行内「建线索」开始'}
          />
        )}

        {/* 分页 */}
        {!isLoading && (data?.total ?? 0) > 0 && (
          <div className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-xs text-text-secondary">
            <span>共 {data?.total ?? 0} 条</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="rounded-md border border-border bg-surface px-2 py-0.5 transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
              >
                ‹
              </button>
              <span className="px-1">{page} / {Math.max(Math.ceil((data?.total ?? 0) / 20), 1)}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil((data?.total ?? 0) / 20)}
                className="rounded-md border border-border bg-surface px-2 py-0.5 transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
              >
                ›
              </button>
            </div>
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

      <Modal open={convertBlockOpen} onClose={() => setConvertBlockOpen(false)} title="暂不满足转化条件">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            线索转化商机前，需要补全以下信息：
          </p>
          <ul className="space-y-2">
            {convertBlockReasons.map((reason) => (
              <li key={reason} className="flex items-center gap-2 text-sm text-warning">
                <AlertCircle size={16} />
                {reason}
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              onClick={() => setConvertBlockOpen(false)}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              我知道了
            </button>
          </div>
        </div>
      </Modal>

      {confirmDialog.dialog}
    </div>
  )
}
