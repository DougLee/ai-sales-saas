import { useEffect, useState } from 'react'
import { Plus, Search, Loader2, Trash2, Users, Building2, Phone, MapPin, FolderOpen, User, ArrowRight, Pencil, Calendar, Flag, Hand, UserX, Database, AlertTriangle, Target, CheckCircle2, XCircle, TrendingUp, GitMerge } from 'lucide-react'
import { useCompanies, useDeleteCompany, useClaimCompany, useAssignCompany, useUpdateCompanyStatus, useCompanyMissingFields, useCompanyChangeHistory, useMergeCompany, useCompanyDuplicates } from '../hooks/use-companies.js'
import { useCompany } from '../hooks/use-companies.js'
import { useCanAssign } from '../hooks/use-permission.js'
import { useDebouncedValue } from '../hooks/use-debounced-value.js'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { entityRouteTo } from '../lib/entity-links.js'
import Drawer from '../components/ui/drawer.js'
import VisitDetailDrawer from '../components/visits/visit-detail-drawer.js'
import CustomerForm from '../components/forms/customer-form.js'
import LeadForm from '../components/forms/lead-form.js'
import AiEntryButton from '../components/ai/ai-entry-button.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { useConfirmDialog } from '../hooks/use-confirm-dialog.js'
import { TimelineView } from '../components/timeline/timeline-view.js'

const industryLabels: Record<string, string> = {
  education: '教育',
  technology: '科技',
  finance: '金融',
  healthcare: '医疗',
  manufacturing: '制造',
  retail: '零售',
  government: '政府',
  energy: '能源',
  telecom: '电信',
  media: '传媒',
  real_estate: '房地产',
  logistics: '物流',
  agriculture: '农业',
}

const urgencyLabels: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '紧急',
}

const decisionRoleLabels: Record<string, string> = {
  COACH: '引导者',
  EVALUATOR: '评估者',
  DECISION_MAKER: '决策者',
}

const STATUS_OPTIONS = [
  { key: 'all', label: '全部', icon: Database },
  { key: 'target', label: '目标客户', icon: Target },
  { key: 'following', label: '在跟进', icon: TrendingUp },
  { key: 'won', label: '成交', icon: CheckCircle2 },
  { key: 'lost', label: '流失', icon: XCircle },
] as const

const POOL_OPTIONS = [
  { key: 'all', label: '全部', icon: Database },
  { key: 'open', label: '公海池', icon: Users },
  { key: 'mine', label: '我的客户', icon: User },
] as const

const statusLabels: Record<string, string> = {
  target: '目标客户',
  following: '在跟进客户',
  won: '成交客户',
  lost: '流失客户',
}

const statusBadgeClasses: Record<string, string> = {
  target: 'bg-surface-elevated text-text-tertiary border border-border',
  following: 'bg-primary/10 text-primary',
  won: 'bg-success/10 text-success',
  lost: 'bg-text-tertiary/10 text-text-tertiary',
}

export default function Customers() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [pool, setPool] = useState('all')
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [openForm, setOpenForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ReturnType<typeof useCompany>['data'] | undefined>(undefined)
  const [leadFormOpen, setLeadFormOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [visitDetailId, setVisitDetailId] = useState<string | undefined>(undefined)
  const [searchParams, setSearchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all')

  const { data, isLoading, error } = useCompanies({ search: debouncedSearch, pool, status: statusFilter === 'all' ? undefined : statusFilter })
  const { data: detailData, isLoading: detailLoading } = useCompany(detailId)
  const { data: missingFields } = useCompanyMissingFields(detailId)
  const { data: changeHistory } = useCompanyChangeHistory(detailId)

  const companyId = searchParams.get('id')
  useEffect(() => {
    if (!companyId || !data) return
    const company = data.items.find((c) => c.id === companyId)
    if (company) {
      setDetailId(company.id)
      setSearchParams({}, { replace: true })
    }
  }, [companyId, data, setSearchParams])
  const del = useDeleteCompany()
  const confirmDialog = useConfirmDialog()
  const claim = useClaimCompany()
  const assign = useAssignCompany()
  const updateStatus = useUpdateCompanyStatus()
  const merge = useMergeCompany()
  const { data: mergeCandidates, isLoading: mergeLoading } = useCompanyDuplicates(
    mergeOpen ? detailData?.company.name : undefined,
    detailId,
  )
  const navigate = useNavigate()

  const canAssign = useCanAssign()

  useEffect(() => {
    const status = searchParams.get('status')
    if (status && STATUS_OPTIONS.some((s) => s.key === status)) {
      setStatusFilter(status)
    }
  }, [searchParams])

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog.confirm({
      title: '删除客户',
      description: '删除后不可恢复，确定删除这家客户吗？',
      confirmLabel: '删除',
      danger: true,
    }))) return
    del.mutate(id)
  }

  const handleClaim = async (id: string) => {
    if (!(await confirmDialog.confirm({
      title: '认领客户',
      description: '认领后您将成为该客户的负责人，确定认领吗？',
      confirmLabel: '认领',
    }))) return
    claim.mutate(id)
  }

  const handleRelease = async (id: string) => {
    if (!(await confirmDialog.confirm({
      title: '释放到公海池',
      description: '释放后您将不再是该客户的负责人，其他同事可以认领。确定释放吗？',
      confirmLabel: '释放',
      danger: true,
    }))) return
    assign.mutate({ id, ownerId: null })
  }

  const handleMerge = async (fromId: string, fromName: string) => {
    if (!detailData) return
    // 不可逆数据迁移：最高防护，必须输入被合并客户名
    if (!(await confirmDialog.confirm({
      title: '合并客户',
      description: `「${fromName}」的全部联系人、线索、商机、拜访、任务将迁移到「${detailData.company.name}」，并被归档（软删除）。此操作不可自动撤销。`,
      confirmLabel: '确认合并',
      danger: true,
      requireText: fromName,
    }))) return
    merge.mutate(
      { intoId: detailData.company.id, fromId },
      { onSuccess: () => setMergeOpen(false) },
    )
  }

  const companies = data?.items || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">
          {statusFilter === 'target' ? '目标客户' : '客户管理'}
        </h2>
        <div className="flex gap-2">
          <AiEntryButton
            prompt="帮我分析当前客户池，哪些客户有商机潜力"
            label="问小销"
            variant="primary"
            className="rounded-xl px-4 py-2 text-sm"
          />
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索客户名称、地区..."
              className="h-10 rounded-xl border border-border bg-surface pl-9 pr-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
            />
          </div>
          <button
            onClick={() => { setEditingItem(undefined); setOpenForm(true) }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus size={16} /> 新建客户
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              setStatusFilter(s.key)
              if (s.key === 'all') {
                setSearchParams({}, { replace: true })
              } else {
                setSearchParams({ status: s.key }, { replace: true })
              }
            }}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${
              statusFilter === s.key
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary'
            }`}
          >
            <s.icon size={12} /> {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {POOL_OPTIONS.map((p) => {
          const isOpenPool = p.key === 'open'
          return (
            <button
              key={p.key}
              onClick={() => setPool(p.key)}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                pool === p.key
                  ? isOpenPool
                    ? 'bg-warning/10 text-warning font-medium'
                    : 'bg-primary/10 text-primary font-medium'
                  : isOpenPool
                    ? 'text-warning hover:bg-warning/5'
                    : 'text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary'
              }`}
            >
              <p.icon size={12} /> {p.label}
            </button>
          )
        })}
      </div>

      {pool === 'open' && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-3 text-xs text-warning">
          公海池中的客户尚未被任何销售人员认领。点击客户右侧的「认领」按钮即可将其纳入您的客户池。
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <span className="text-sm text-text-tertiary">
            {isLoading ? '加载中...' : `共 ${data?.total ?? companies.length} 家客户${(data?.total ?? 0) > companies.length ? '（仅显示前 100 家，请用搜索缩小范围）' : ''}`}
          </span>
        </div>

        {isLoading && <LoadingState />}

        {error && <ErrorState message={(error as Error).message || '加载失败'} />}

        {!isLoading && !error && companies.length === 0 && (
          <EmptyState
            icon={Users}
            title="暂无客户数据"
            description="从线索转化或手动录入客户"
          />
        )}

        {!isLoading && !error && companies.length > 0 && (
          <div className="divide-y divide-border">
            {companies.map((company) => (
              <div
                key={company.id}
                className="flex items-center justify-between px-6 py-4 hover:bg-surface-elevated/50 transition-colors cursor-pointer"
                onClick={() => setDetailId(company.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">{company.name}</p>
                    <div className="flex items-center gap-3 text-sm text-text-secondary">
                      {company.status && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusBadgeClasses[company.status] || 'bg-surface-elevated text-text-tertiary'}`}>
                          {statusLabels[company.status] || company.status}
                        </span>
                      )}
                      {company.industry && <span>{industryLabels[company.industry] || company.industry}</span>}
                      {company.region && (
                        <span className="flex items-center gap-1 text-text-tertiary">
                          <MapPin size={12} /> {company.region}
                        </span>
                      )}
                      {company.owner && (
                        <span className="flex items-center gap-1 text-text-tertiary">
                          <User size={12} /> {company.owner.name}
                        </span>
                      )}
                      {!company.ownerId && (
                        <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">公海池</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  {company.completenessScore != null && (
                    <div className="flex items-center gap-1 text-xs text-text-tertiary" title="客户完整度评分">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                        <div
                          className={`h-full rounded-full ${
                            company.completenessScore >= 85 ? 'bg-success' : company.completenessScore >= 60 ? 'bg-warning' : 'bg-danger'
                          }`}
                          style={{ width: `${company.completenessScore}%` }}
                        />
                      </div>
                      {company.completenessScore}
                    </div>
                  )}
                  {!company.ownerId && (
                    <button
                      onClick={() => handleClaim(company.id)}
                      disabled={claim.isPending}
                      className="flex items-center gap-1 rounded-lg bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-success/90 transition-colors disabled:opacity-50"
                    >
                      <Hand size={12} /> {claim.isPending ? '认领中...' : '认领'}
                    </button>
                  )}
                  <AiEntryButton
                    prompt={`请帮我分析这个客户：${company.name}${company.industry ? '（' + (industryLabels[company.industry] || company.industry) + '）' : ''}`}
                    label="问小销"
                    variant="ghost"
                    entityType="customer"
                    entityId={company.id}
                  />
                  <button
                    onClick={() => navigate('/projects')}
                    className="text-xs text-text-tertiary hover:text-primary hover:underline transition-colors"
                  >
                    {company._count?.projects ?? 0} 商机 · {company._count?.leads ?? 0} 线索 · {company._count?.visits ?? 0} 拜访
                  </button>
                  <button
                    onClick={() => handleDelete(company.id)}
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

      {/* Detail Drawer */}
      <Drawer open={!!detailId} onClose={() => { setDetailId(undefined); setMergeOpen(false) }} title="客户详情">
        {detailLoading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {detailData && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">{detailData.company.name}</h3>
                <div className="mt-1 flex items-center gap-3 text-sm text-text-secondary">
                  {detailData.company.industry && <span>{industryLabels[detailData.company.industry] || detailData.company.industry}</span>}
                  {detailData.company.scale && <span>· {detailData.company.scale}</span>}
                  {detailData.company.region && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {detailData.company.region}
                    </span>
                  )}
                  {detailData._readonly && (
                    <span className="rounded-full bg-text-tertiary/10 px-2 py-0.5 text-[10px] text-text-tertiary">
                      由 {detailData.company.owner?.name || '其他同事'} 负责
                    </span>
                  )}
                </div>
              </div>
              {!detailData.company.ownerId && (
                <button
                  onClick={() => handleClaim(detailData.company.id)}
                  disabled={claim.isPending}
                  className="flex items-center gap-1 rounded-lg bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-success/90 transition-colors disabled:opacity-50"
                  title="认领客户"
                >
                  <Hand size={12} /> {claim.isPending ? '认领中...' : '认领'}
                </button>
              )}
              {detailData.company.ownerId && !detailData._readonly && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setLeadFormOpen(true)}
                    className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
                    title="新建线索（商机由线索转化而来）"
                  >
                    <Plus size={12} /> 新建线索
                  </button>
                  {canAssign && (
                    <button
                      onClick={() => handleRelease(detailData.company.id)}
                      disabled={assign.isPending}
                      className="flex items-center gap-1 rounded-lg bg-warning px-2.5 py-1 text-xs font-medium text-white hover:bg-warning/90 transition-colors disabled:opacity-50"
                      title="释放回公海池"
                    >
                      <UserX size={12} /> 释放
                    </button>
                  )}
                  <button
                    onClick={() => setMergeOpen((v) => !v)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      mergeOpen ? 'bg-warning text-white' : 'bg-surface-elevated text-text-secondary hover:bg-warning/10 hover:text-warning'
                    }`}
                    title="合并重复客户"
                  >
                    <GitMerge size={12} /> 合并重复
                  </button>
                  <button
                    onClick={() => { setEditingItem(detailData); setOpenForm(true) }}
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-primary/10 hover:text-primary transition-colors"
                    title="编辑客户"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* 合并重复客户面板 */}
            {mergeOpen && !detailData._readonly && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <GitMerge size={14} className="text-warning" />
                  合并重复客户到「{detailData.company.name}」
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                  选择一个疑似重复的客户，其关联数据将迁移到当前客户并归档原记录。
                </p>
                <div className="mt-2 space-y-1.5">
                  {mergeLoading && <p className="py-2 text-center text-xs text-text-tertiary">检索重复客户...</p>}
                  {!mergeLoading && (!mergeCandidates || mergeCandidates.length === 0) && (
                    <p className="py-2 text-center text-xs text-text-tertiary">未发现疑似重复客户</p>
                  )}
                  {mergeCandidates?.map((cand) => (
                    <div
                      key={cand.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text-primary">{cand.name}</p>
                        <p className="text-[11px] text-text-tertiary">{cand.reason} · 相似度 {cand.similarity}%</p>
                      </div>
                      <button
                        onClick={() => handleMerge(cand.id, cand.name)}
                        disabled={merge.isPending}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-warning px-2.5 py-1 text-xs font-medium text-white hover:bg-warning/90 transition-colors disabled:opacity-50"
                      >
                        <GitMerge size={12} /> {merge.isPending ? '合并中...' : '合并到当前'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 360 Status Summary */}
            {!detailData._readonly && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-xs text-text-tertiary">活跃商机</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {detailData.stats.activeProjectCount}
                    <span className="ml-1 text-xs font-normal text-text-tertiary">/ {detailData.stats.projectCount}</span>
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-xs text-text-tertiary">联系人</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {detailData.stats.contactCount}
                    <span className="ml-1 text-xs font-normal text-text-tertiary">· 决策人 {detailData.stats.decisionMakerCount}</span>
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-xs text-text-tertiary">平均健康度</p>
                  <p className={`mt-1 text-lg font-semibold ${
                    (detailData.stats.avgHealthScore ?? 60) >= 60 ? 'text-success' :
                    (detailData.stats.avgHealthScore ?? 60) >= 40 ? 'text-warning' : 'text-danger'
                  }`}>
                    {detailData.stats.avgHealthScore ?? '-'}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-xs text-text-tertiary">最近联系</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {detailData.stats.daysSinceLastContact != null
                      ? `${detailData.stats.daysSinceLastContact} 天前`
                      : '从未'}
                  </p>
                </div>
              </div>
            )}

            {/* Risk Warnings */}
            {!detailData._readonly && detailData.risks.length > 0 && (
              <div className="space-y-2">
                {detailData.risks.map((risk) => (
                  <div
                    key={risk.type}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      risk.severity === 'HIGH'
                        ? 'border-danger/20 bg-danger/5 text-danger'
                        : risk.severity === 'MEDIUM'
                        ? 'border-warning/20 bg-warning/5 text-warning'
                        : 'border-primary/20 bg-primary/5 text-primary'
                    }`}
                  >
                    <AlertTriangle size={16} />
                    <span>{risk.message}</span>
                  </div>
                ))}
              </div>
            )}

            {detailData._readonly && (
              <div className="rounded-lg border border-border bg-surface-elevated/50 px-3 py-2 text-xs text-text-secondary">
                该客户由其他同事负责，您只能查看基本信息，无法查看详情和操作。
              </div>
            )}

            {/* Status & Completeness */}
            {!detailData._readonly && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-text-secondary">当前状态</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClasses[detailData.company.status || 'target']}`}>
                      {statusLabels[detailData.company.status || 'target']}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailData.company.status === 'target' && (
                      <button
                        onClick={() => updateStatus.mutate({ id: detailData.company.id, status: 'following' })}
                        disabled={updateStatus.isPending}
                        className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                      >
                        转为在跟进
                      </button>
                    )}
                    {detailData.company.status === 'following' && (
                      <>
                        <button
                          onClick={() => updateStatus.mutate({ id: detailData.company.id, status: 'won' })}
                          disabled={updateStatus.isPending}
                          className="rounded-lg bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
                        >
                          标记成交
                        </button>
                        <button
                          onClick={() => updateStatus.mutate({ id: detailData.company.id, status: 'lost' })}
                          disabled={updateStatus.isPending}
                          className="rounded-lg bg-text-tertiary/20 px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-text-tertiary/30 disabled:opacity-50"
                        >
                          标记流失
                        </button>
                      </>
                    )}
                    {(detailData.company.status === 'won' || detailData.company.status === 'lost') && (
                      <button
                        onClick={() => updateStatus.mutate({ id: detailData.company.id, status: 'following' })}
                        disabled={updateStatus.isPending}
                        className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                      >
                        重新激活
                      </button>
                    )}
                  </div>
                </div>

                {detailData.completeness && (
                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-text-secondary">客户完整度</span>
                      <span className={`text-sm font-semibold ${
                        detailData.completeness.score >= 85 ? 'text-success' :
                        detailData.completeness.score >= 60 ? 'text-warning' : 'text-danger'
                      }`}>
                        {detailData.completeness.score} 分
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border">
                      <div
                        className={`h-full rounded-full transition-all ${
                          detailData.completeness.score >= 85 ? 'bg-success' :
                          detailData.completeness.score >= 60 ? 'bg-warning' : 'bg-danger'
                        }`}
                        style={{ width: `${detailData.completeness.score}%` }}
                      />
                    </div>
                  </div>
                )}

                {missingFields && missingFields.length > 0 && (
                  <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-warning">
                      <AlertTriangle size={14} />
                      <span>缺失字段提醒</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {missingFields.map((field) => (
                        <span
                          key={field.field}
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            field.severity === 'high' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'
                          }`}
                        >
                          {field.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Contact Info */}
            <div className="rounded-xl border border-border bg-background p-4">
              <h4 className="mb-3 text-sm font-medium text-text-secondary">联系信息</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {detailData.company.contactPerson && (
                  <div>
                    <span className="text-xs text-text-tertiary">联系人</span>
                    <p className="text-text-primary">{detailData.company.contactPerson}</p>
                  </div>
                )}
                {detailData.company.contactPhone && (
                  <div>
                    <span className="text-xs text-text-tertiary">电话</span>
                    <p className="text-text-primary">{detailData.company.contactPhone}</p>
                  </div>
                )}
                {detailData.company.address && (
                  <div className="col-span-2">
                    <span className="text-xs text-text-tertiary">地址</span>
                    <p className="text-text-primary">{detailData.company.address}</p>
                  </div>
                )}
                {detailData.company.website && (
                  <div className="col-span-2">
                    <span className="text-xs text-text-tertiary">官网</span>
                    <a href={detailData.company.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {detailData.company.website}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {!detailData._readonly && (
              <>
                {/* Related Projects */}
                <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                  <FolderOpen size={14} /> 关联商机 ({detailData.projects.length})
                </h4>
              </div>
              {detailData.projects.length === 0 && (
                <p className="text-xs text-text-tertiary">暂无关联商机</p>
              )}
              <div className="space-y-2">
                {detailData.projects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
                    onClick={() => navigate(entityRouteTo('project', p.id))}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{p.name}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          p.urgency === 'CRITICAL' ? 'bg-danger/10 text-danger' :
                          p.urgency === 'HIGH' ? 'bg-warning/10 text-warning' :
                          p.urgency === 'MEDIUM' ? 'bg-primary/10 text-primary' :
                          'bg-success/10 text-success'
                        }`}>
                          {urgencyLabels[p.urgency] || p.urgency}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
                        <span>里程碑 M{p.milestone}</span>
                        {p.healthScore != null && <span>· 健康度 {p.healthScore}分</span>}
                        {p.amount != null && <span>· 预估 {p.amount}万</span>}
                      </div>
                    </div>
                    {p.closedAt ? (
                      <span className="shrink-0 text-[10px] text-text-tertiary">已关闭</span>
                    ) : (
                      <ArrowRight size={14} className="shrink-0 text-text-tertiary" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Related Contacts */}
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                  <Users size={14} /> 关联联系人 ({detailData.contacts.length})
                </h4>
              </div>
              {detailData.contacts.length === 0 && (
                <p className="text-xs text-text-tertiary">暂无关联联系人</p>
              )}
              <div className="space-y-2">
                {detailData.contacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
                    onClick={() => navigate(entityRouteTo('contact', c.id))}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{c.name}</span>
                        {c.decisionRole && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{decisionRoleLabels[c.decisionRole] || c.decisionRole}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-tertiary">
                        {c.position && <span>{c.position}</span>}
                        {c.department && <span>· {c.department}</span>}
                        {c.phone && <span>· {c.phone}</span>}
                      </div>
                    </div>
                    {c.phone && (
                      <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="shrink-0 rounded-lg p-1.5 text-text-tertiary hover:bg-primary/10 hover:text-primary transition-colors">
                        <Phone size={12} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Visits */}
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                  <Calendar size={14} /> 近期拜访 ({detailData.visits?.length || 0})
                </h4>
              </div>
              {(!detailData.visits || detailData.visits.length === 0) && (
                <p className="text-xs text-text-tertiary">暂无拜访记录</p>
              )}
              <div className="space-y-2">
                {detailData.visits?.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
                    onClick={() => setVisitDetailId(v.id)}
                  >
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      v.visitType === 'offline' ? 'bg-primary/10 text-primary' :
                      v.visitType === 'online' ? 'bg-success/10 text-success' :
                      'bg-warning/10 text-warning'
                    }`}>
                      {v.visitType === 'offline' ? '线下' : v.visitType === 'online' ? '线上' : '电话'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-primary">{v.summary || '无摘要'}</p>
                      <p className="text-xs text-text-tertiary">
                        {new Date(v.visitTime).toLocaleString('zh-CN')}
                        {v.project?.name ? ` · ${v.project.name}` : ''}
                      </p>
                    </div>
                    {v.contactName && (
                      <span className="shrink-0 text-xs text-text-secondary">{v.contactName}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Tasks */}
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                  <Flag size={14} /> 待办任务 ({detailData.tasks?.length || 0})
                </h4>
              </div>
              {(!detailData.tasks || detailData.tasks.length === 0) && (
                <p className="text-xs text-text-tertiary">暂无待办任务</p>
              )}
              <div className="space-y-2">
                {detailData.tasks?.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary">{t.title}</p>
                      <p className="text-xs text-text-tertiary">
                        {t.deadline ? `截止：${new Date(t.deadline).toLocaleDateString('zh-CN')}` : '无截止日期'}
                        {t.project?.name ? ` · ${t.project.name}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      t.priority === 'URGENT' ? 'bg-danger/10 text-danger' :
                      t.priority === 'HIGH' ? 'bg-warning/10 text-warning' :
                      t.priority === 'MEDIUM' ? 'bg-primary/10 text-primary' :
                      'bg-success/10 text-success'
                    }`}>
                      {t.priority === 'URGENT' ? '紧急' : t.priority === 'HIGH' ? '高' : t.priority === 'MEDIUM' ? '中' : '低'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Feed */}
            {!detailData._readonly && (
              <>
                {/* Change History */}
                {changeHistory && changeHistory.length > 0 && (
                  <div className="rounded-xl border border-border bg-background p-4">
                    <h4 className="mb-3 text-sm font-medium text-text-secondary">变更历史</h4>
                    <div className="space-y-2">
                      {changeHistory.slice(0, 10).map((h) => (
                        <div key={h.id} className="flex items-start gap-2 text-xs">
                          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                          <div className="flex-1">
                            <p className="text-text-secondary">
                              <span className="font-medium text-text-primary">{h.fieldName}</span>
                              {' '}从 <span className="text-text-tertiary line-through">{h.oldValue || '-'}</span>
                              {' '}改为 <span className="text-text-primary">{h.newValue || '-'}</span>
                            </p>
                            <p className="mt-0.5 text-text-tertiary">
                              {new Date(h.createdAt).toLocaleString()} · {h.changeSource === 'ai' ? 'AI' : '手动'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <TimelineView entityType="customer" entityId={detailData.company.id} title="客户时间轴" showProject />
              </>
            )}

            {/* Notes */}
            {detailData.company.notes && (
              <div className="rounded-xl border border-border bg-background p-4">
                <h4 className="mb-2 text-sm font-medium text-text-secondary">备注</h4>
                <p className="whitespace-pre-wrap text-sm text-text-primary">{detailData.company.notes}</p>
              </div>
            )}
          </>
        )}
          </div>
        )}
      </Drawer>

      <VisitDetailDrawer visitId={visitDetailId} onClose={() => setVisitDetailId(undefined)} />

      <CustomerForm
        open={openForm}
        onClose={() => { setOpenForm(false); setEditingItem(undefined) }}
        initialData={editingItem?.company}
      />
      <LeadForm
        open={leadFormOpen}
        onClose={() => setLeadFormOpen(false)}
        prefilledCompanyId={detailId}
      />

      {confirmDialog.dialog}
    </div>
  )
}
