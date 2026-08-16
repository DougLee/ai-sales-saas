import { useEffect, useState } from 'react'
import { Plus, Search, Loader2, Trash2, Users, MapPin, FolderOpen, ArrowRight, Pencil, Calendar, Flag, Hand, UserX, AlertTriangle, GitMerge, Bot, History, Check, RefreshCw, XCircle } from 'lucide-react'
import { useCompanies, useDeleteCompany, useClaimCompany, useAssignCompany, useUpdateCompanyStatus, useCompanyMissingFields, useCompanyChangeHistory, useMergeCompany, useCompanyDuplicates, useCompanyMetrics, useBatchCompany, useAssignableUsers } from '../hooks/use-companies.js'
import { useCompany } from '../hooks/use-companies.js'
import { useCanAssign } from '../hooks/use-permission.js'
import { useDebouncedValue } from '../hooks/use-debounced-value.js'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { entityRouteTo } from '../lib/entity-links.js'
import { INDUSTRY_OPTIONS, SOURCE_OPTIONS, LEVEL_OPTIONS, sourceLabel, industryLabel } from '../lib/company-options.js'
import Stage from '../components/ui/stage.js'
import VisitDetailDrawer from '../components/visits/visit-detail-drawer.js'
import CustomerForm from '../components/forms/customer-form.js'
import LeadForm from '../components/forms/lead-form.js'
import AiEntryButton from '../components/ai/ai-entry-button.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { useConfirmDialog } from '../hooks/use-confirm-dialog.js'
import { TimelineView } from '../components/timeline/timeline-view.js'
import { ViewTabs, Pagination } from '../components/ui/tabs.js'
import { DetailLayout, DetailSection, DetailCollapsible, DetailKpiRow, DetailField, DetailFieldGrid, type DetailMenuItem } from '../components/detail/detail-layout.js'
import DecisionChainMatrix from '../components/detail/decision-chain-matrix.js'

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

/** 相对时间：N 天前 / 昨天 / 今天 */
function daysIn(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function daysAgoText(iso: string): string {
  const d = daysIn(iso)
  if (d <= 0) return '今天'
  if (d === 1) return '昨天'
  if (d < 30) return `${d} 天前`
  return `${Math.floor(d / 30)} 个月前`
}

/** 视图页签：状态即视图（公海池 = 无负责人），计数挂页签上 */
const VIEW_TABS = [
  { key: 'target', label: '目标客户' },
  { key: 'following', label: '跟进中' },
  { key: 'won', label: '已成交' },
  { key: 'lost', label: '已流失' },
  { key: 'open', label: '公海池' },
  { key: 'all', label: '全部客户' },
] as const

export default function Customers() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [tab, setTab] = useState<string>('target')
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [openForm, setOpenForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ReturnType<typeof useCompany>['data'] | undefined>(undefined)
  const [leadFormOpen, setLeadFormOpen] = useState(false)
  const [leadFormCompanyId, setLeadFormCompanyId] = useState<string | undefined>(undefined)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [visitDetailId, setVisitDetailId] = useState<string | undefined>(undefined)
  const [searchParams, setSearchParams] = useSearchParams()
  // 列表筛选 + 分页（设计稿 20260813）
  const [fIndustry, setFIndustry] = useState('')
  const [fLevel, setFLevel] = useState('')
  const [fRegion, setFRegion] = useState('')
  const [fSource, setFSource] = useState('')
  const [fOwnerId, setFOwnerId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchOwnerId, setBatchOwnerId] = useState('')

  const { data, isLoading, error } = useCompanies({
    search: debouncedSearch,
    pool: tab === 'open' ? 'open' : undefined,
    status: ['target', 'following', 'won', 'lost'].includes(tab) ? tab : undefined,
    industry: fIndustry || undefined,
    level: fLevel || undefined,
    region: fRegion || undefined,
    source: fSource || undefined,
    ownerId: fOwnerId || undefined,
    page,
    pageSize,
  })
  const { data: metrics } = useCompanyMetrics()
  const batch = useBatchCompany()
  const canAssign = useCanAssign()
  const { data: assignableUsers } = useAssignableUsers(canAssign && selectedIds.size > 0)
  const { data: detailData, isLoading: detailLoading } = useCompany(detailId)
  const { data: missingFields } = useCompanyMissingFields(detailId)
  const { data: changeHistory } = useCompanyChangeHistory(detailId)

  const companyId = searchParams.get('id')
  // 深链直接打开详情（审计 #15：详情走独立查询，无需列表命中）
  useEffect(() => {
    if (!companyId) return
    setDetailId(companyId)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('id')
        return next
      },
      { replace: true },
    )
  }, [companyId, setSearchParams])
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

  // URL ?status= 同步页签；无参数时保持当前页签（审计 #15：原「无参数则重置」会回跳）
  useEffect(() => {
    const status = searchParams.get('status')
    if (status && VIEW_TABS.some((t) => t.key === status)) {
      setTab(status)
    }
  }, [searchParams])

  // 筛选/页签变化回第一页；翻页/筛选变化清空勾选（审计 #15：跨页累积与全选替换语义冲突）
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, tab, fIndustry, fLevel, fRegion, fSource, fOwnerId, pageSize])
  useEffect(() => {
    setSelectedIds(new Set())
  }, [debouncedSearch, tab, fIndustry, fLevel, fRegion, fSource, fOwnerId, pageSize, page])

  const companies = data?.items || []
  const totalCount = data?.total ?? companies.length
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1)
  const counts = data?.counts || {}

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allSelected = companies.length > 0 && companies.every((c) => selectedIds.has(c.id))
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(companies.map((c) => c.id)))
  }

  const handleBatchClaim = async () => {
    if (selectedIds.size === 0) return
    if (!(await confirmDialog.confirm({
      title: '批量认领',
      description: `将认领选中的 ${selectedIds.size} 家客户（已有负责人的将跳过），您将成为其负责人。`,
      confirmLabel: '认领',
    }))) return
    batch.mutate(
      { action: 'claim', ids: [...selectedIds] },
      { onSuccess: () => setSelectedIds(new Set()) },
    )
  }

  const handleBatchAssign = async () => {
    if (selectedIds.size === 0 || !batchOwnerId) return
    const ownerName = assignableUsers?.items.find((u) => u.id === batchOwnerId)?.name || '所选成员'
    if (!(await confirmDialog.confirm({
      title: '批量分配负责人',
      description: `将选中的 ${selectedIds.size} 家客户分配给「${ownerName}」。`,
      confirmLabel: '分配',
    }))) return
    batch.mutate(
      { action: 'assign', ids: [...selectedIds], ownerId: batchOwnerId },
      { onSuccess: () => { setSelectedIds(new Set()); setBatchOwnerId('') } },
    )
  }

  /** 行内「建线索」：直接开预填客户的线索表单（ADR-0001 决策 4，不二次确认） */
  const openLeadForm = (companyId: string) => {
    setLeadFormCompanyId(companyId)
    setLeadFormOpen(true)
  }

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

  return (
    <div className="space-y-4">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-text-primary">
            {tab === 'target' ? '目标客户池' : '客户管理'}
          </h2>
          {tab === 'target' && (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
              L0 · 销售的起点
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <AiEntryButton
            prompt="帮我分析当前客户池，哪些客户有商机潜力"
            label="问小销"
            variant="primary"
            className="rounded-xl px-4 py-2 text-sm"
          />
          <button
            onClick={() => { setEditingItem(undefined); setOpenForm(true) }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus size={16} /> 新建客户
          </button>
        </div>
      </div>

      {/* 视图页签：状态即视图，计数挂页签上（ViewTabs 统一组件） */}
      <ViewTabs
        tabs={VIEW_TABS.map((t) => ({ ...t, count: t.key === 'open' ? (counts.open ?? '-') : (counts[t.key] ?? '-') })) as never}
        value={tab}
        onChange={(key) => {
          setTab(key)
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              if (key === 'target') next.delete('status')
              else next.set('status', key)
              return next
            },
            { replace: true },
          )
        }}
      />

      {/* 指标条（L0 专属）：漏斗过程指标直接顶在页面上 */}
      {tab === 'target' && metrics && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xl font-bold text-text-primary">
              {metrics.total}
              {metrics.weeklyNew > 0 && (
                <span className="ml-1.5 text-[11px] font-medium text-success">本周 +{metrics.weeklyNew}</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">池子总量（周新增 = 团队第一过程指标）</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xl font-bold text-text-primary">
              {metrics.reached}
              <span className="ml-1.5 text-[11px] font-normal text-text-tertiary">{metrics.reachedRate}%</span>
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">已触达（至少一次拜访）</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xl font-bold text-success">
              {metrics.producedLeads}
              <span className="ml-1.5 text-[11px] font-medium text-success">转化率① {metrics.conversionRate1}%</span>
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">已产出线索（目标客户 → 线索）</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className={`text-xl font-bold ${metrics.pendingVerify > 0 ? 'text-warning' : 'text-text-primary'}`}>
              {metrics.pendingVerify}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">待核实（小销收集超 7 天未补充）</p>
          </div>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索客户名称 / 联系人 / 电话"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
          />
        </div>
        <select value={fIndustry} onChange={(e) => setFIndustry(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary outline-none focus:border-primary cursor-pointer" title="行业">
          <option value="">行业：全部</option>
          {INDUSTRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fLevel} onChange={(e) => setFLevel(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary outline-none focus:border-primary cursor-pointer" title="等级">
          <option value="">等级：全部</option>
          {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fRegion} onChange={(e) => setFRegion(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary outline-none focus:border-primary cursor-pointer" title="地区">
          <option value="">地区：全部</option>
          {[...new Set([fRegion, ...companies.map((c) => c.region).filter(Boolean)].filter(Boolean))].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select value={fSource} onChange={(e) => setFSource(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary outline-none focus:border-primary cursor-pointer" title="来源">
          <option value="">来源：全部</option>
          {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fOwnerId} onChange={(e) => setFOwnerId(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary outline-none focus:border-primary cursor-pointer" title="负责人">
          <option value="">负责人：全部</option>
          <option value="none">未分配</option>
          {[...new Map(companies.filter((c) => c.owner).map((c) => [c.owner!.id, c.owner!.name] as const)).entries()].map(([id, name]) => (
            <option key={id} value={id}>{fOwnerId === id ? `${name}（当前筛选）` : name}</option>
          ))}
        </select>
        {(fIndustry || fLevel || fRegion || fSource || fOwnerId) && (
          <button
            onClick={() => { setFIndustry(''); setFLevel(''); setFRegion(''); setFSource(''); setFOwnerId('') }}
            className="text-xs text-primary hover:underline"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* 批量操作条（勾选后浮现） */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs text-primary">
          <span>已选 <b>{selectedIds.size}</b> 家</span>
          <button onClick={handleBatchClaim} disabled={batch.isPending} className="font-medium hover:underline disabled:opacity-50">
            {batch.isPending ? '处理中...' : '批量认领'}
          </button>
          {canAssign && (
            <span className="flex items-center gap-2">
              <select value={batchOwnerId} onChange={(e) => setBatchOwnerId(e.target.value)} className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-text-secondary outline-none focus:border-primary cursor-pointer">
                <option value="">选择成员…</option>
                {assignableUsers?.items.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button onClick={handleBatchAssign} disabled={batch.isPending || !batchOwnerId} className="font-medium hover:underline disabled:opacity-50">
                分配负责人
              </button>
            </span>
          )}
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-text-secondary hover:underline">
            取消选择
          </button>
        </div>
      )}

      {/* 数据表 */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-elevated/60 text-left text-xs font-medium text-text-secondary">
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="cursor-pointer" aria-label="全选" />
                </th>
                <th className="px-3 py-2.5">客户名称</th>
                <th className="px-3 py-2.5">等级</th>
                <th className="px-3 py-2.5">行业</th>
                <th className="px-3 py-2.5">地区</th>
                <th className="px-3 py-2.5">联系人</th>
                <th className="px-3 py-2.5">来源</th>
                <th className="px-3 py-2.5">负责人</th>
                <th className="px-3 py-2.5">完整度</th>
                <th className="px-3 py-2.5">最近动态</th>
                <th className="px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => {
                const days = daysAgoText(company.updatedAt)
                const stale = daysIn(company.updatedAt) > 30
                const needVerify = company.source === 'ai_recommendation' && daysIn(company.updatedAt) > 7
                const levelOpt = LEVEL_OPTIONS.find((l) => l.value === company.level)
                return (
                  <tr
                    key={company.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-primary/[0.03]"
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(company.id)}
                        onChange={() => toggleSelect(company.id)}
                        className="cursor-pointer"
                        aria-label={`选择 ${company.name}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setDetailId(company.id)}
                        className="font-medium text-primary hover:underline"
                      >
                        {company.name}
                      </button>
                      {company.source === 'ai_recommendation' && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-md border border-violet-200 bg-violet-50 px-1 text-[11px] font-medium text-violet-600" title="小销 AI 建档，待核实">
                          <Bot size={9} /> 小销
                        </span>
                      )}
                      <p className="text-[11px] text-text-tertiary">{company.scale || '规模待补充'}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        <i className={`h-2 w-2 rounded-full ${levelOpt?.dot || 'bg-text-tertiary/30'}`} />
                        {company.level || '未定'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-secondary">
                      {industryLabel(company.industry, industryLabels)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-secondary">{company.region || '-'}</td>
                    <td className="px-3 py-2.5">
                      {company.contactPerson ? (
                        <>
                          <p className="text-xs text-text-primary">{company.contactPerson}</p>
                          {company.contactPhone && <p className="text-[11px] text-text-tertiary">{company.contactPhone}</p>}
                        </>
                      ) : (
                        <span className="text-[11px] text-text-tertiary">待补充</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-secondary">{sourceLabel(company.source)}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {company.owner ? (
                        <span className="text-text-secondary">{company.owner.name}</span>
                      ) : (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning">公海</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-border">
                          <div
                            className={`h-full rounded-full ${
                              (company.completenessScore ?? 0) >= 70 ? 'bg-success' : (company.completenessScore ?? 0) >= 40 ? 'bg-warning' : 'bg-danger'
                            }`}
                            style={{ width: `${company.completenessScore ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-text-secondary">{company.completenessScore ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs text-text-secondary">{days} · {company._count?.visits ?? 0} 拜访</p>
                      {needVerify && <p className="flex items-center gap-0.5 text-[11px] text-warning"><AlertTriangle size={10} /> 待核实</p>}
                      {!needVerify && stale && <p className="flex items-center gap-0.5 text-[11px] text-danger"><AlertTriangle size={10} /> 超期未跟进</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {company.ownerId ? (
                          <button
                            onClick={() => openLeadForm(company.id)}
                            className="rounded-md bg-success px-2 py-0.5 text-xs font-semibold text-white transition-colors hover:bg-success/90"
                            title="从此客户创建线索（L0 → L1）"
                          >
                            建线索
                          </button>
                        ) : (
                          <button
                            onClick={() => handleClaim(company.id)}
                            disabled={claim.isPending}
                            className="rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-white transition-colors hover:bg-warning/90 disabled:opacity-50"
                            title="认领到我的客户池"
                          >
                            认领
                          </button>
                        )}
                        <button
                          onClick={() => setDetailId(company.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          详情
                        </button>
                        <button
                          onClick={() => handleDelete(company.id)}
                          className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
                          title="删除客户"
                          aria-label={`删除 ${company.name}`}
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
        {!isLoading && !error && companies.length === 0 && (
          <EmptyState
            icon={Users}
            title="暂无客户数据"
            description={tab === 'target' ? '新建目标客户，或让小销从对话中收集建档' : '换个筛选条件试试'}
            action={tab === 'target' ? (
              <button
                onClick={() => { setEditingItem(undefined); setOpenForm(true) }}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                <Plus size={16} /> 新建目标客户
              </button>
            ) : undefined}
          />
        )}

        {/* 分页（Pagination 统一组件） */}
        {!isLoading && totalCount > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            totalLabel={`共 ${totalCount} 家`}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {/* 客户详情（Stage sm 640px 居中舞台：头区主行动 / 体区两列栅格 / 尾区粘底行动条） */}
      <Stage open={!!detailId} onClose={() => { setDetailId(undefined); setMergeOpen(false) }} title="客户详情" size="sm">
        {detailLoading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {detailData && (() => {
          const company = detailData.company
          const status = company.status || 'target'
          const completenessScore = detailData.completeness?.score ?? company.completenessScore ?? 0
          // ⋯ 菜单：状态切换 / 释放 / 合并重复等非主行动操作收进来（危险动作一律进菜单）
          const menuItems: DetailMenuItem[] = []
          if (!detailData._readonly && company.ownerId) {
            if (status === 'target') {
              menuItems.push({ key: 'status-following', label: '转为在跟进', icon: <ArrowRight size={14} />, onSelect: () => updateStatus.mutate({ id: company.id, status: 'following' }) })
            } else if (status === 'following') {
              menuItems.push({ key: 'status-won', label: '标记成交', icon: <Check size={14} />, onSelect: () => updateStatus.mutate({ id: company.id, status: 'won' }) })
              menuItems.push({ key: 'status-lost', label: '标记流失', icon: <XCircle size={14} />, danger: true, onSelect: () => updateStatus.mutate({ id: company.id, status: 'lost' }) })
            } else {
              menuItems.push({ key: 'status-reactivate', label: '重新激活', icon: <RefreshCw size={14} />, onSelect: () => updateStatus.mutate({ id: company.id, status: 'following' }) })
            }
            if (canAssign) {
              menuItems.push({ key: 'release', label: '释放到公海池', icon: <UserX size={14} />, danger: true, onSelect: () => handleRelease(company.id) })
            }
            menuItems.push({ key: 'merge', label: '合并重复客户', icon: <GitMerge size={14} />, onSelect: () => setMergeOpen((v) => !v) })
          }
          const openEdit = () => { setEditingItem(detailData); setOpenForm(true) }
          return (
            <DetailLayout
              title={company.name}
              badges={
                <>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClasses[status]}`}>
                    {statusLabels[status]}
                  </span>
                  {company.source === 'ai_recommendation' && (
                    <span className="inline-flex items-center gap-0.5 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-600" title="小销 AI 建档，待核实">
                      <Bot size={10} /> 小销
                    </span>
                  )}
                  {detailData._readonly && (
                    <span className="rounded-full bg-text-tertiary/10 px-2 py-0.5 text-[11px] text-text-tertiary">只读</span>
                  )}
                </>
              }
              meta={
                <>
                  {company.industry && <span>{industryLabels[company.industry] || company.industry}</span>}
                  {company.scale && <span>· {company.scale}</span>}
                  {company.region && (
                    <span className="flex items-center gap-0.5"><MapPin size={11} /> {company.region}</span>
                  )}
                  <span>{company.owner ? `负责人 ${company.owner.name}` : '公海池'}</span>
                  {!detailData._readonly && detailData.stats.daysSinceLastContact != null && (
                    <span>最近联系 {detailData.stats.daysSinceLastContact} 天前</span>
                  )}
                </>
              }
              primary={
                !company.ownerId ? (
                  <button
                    onClick={() => handleClaim(company.id)}
                    disabled={claim.isPending}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-success px-3.5 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                    title="认领客户"
                  >
                    <Hand size={14} /> {claim.isPending ? '认领中...' : '认领'}
                  </button>
                ) : !detailData._readonly ? (
                  <button
                    onClick={openEdit}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                    title="编辑客户"
                  >
                    <Pencil size={14} /> 编辑
                  </button>
                ) : undefined
              }
              secondary={
                company.ownerId && !detailData._readonly ? (
                  <button
                    onClick={() => setLeadFormOpen(true)}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                    title="新建线索（商机由线索转化而来）"
                  >
                    <Plus size={14} /> 新建线索
                  </button>
                ) : undefined
              }
              menu={menuItems}
              footer={
                !detailData._readonly ? (
                  <>
                    {company.ownerId ? (
                      <>
                        <button
                          onClick={() => setLeadFormOpen(true)}
                          className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                          title="新建线索（商机由线索转化而来）"
                        >
                          <Plus size={14} /> 新建线索
                        </button>
                        <button
                          onClick={openEdit}
                          className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                          title="编辑客户"
                        >
                          <Pencil size={14} /> 编辑
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleClaim(company.id)}
                        disabled={claim.isPending}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-success px-3.5 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                        title="认领客户"
                      >
                        <Hand size={14} /> {claim.isPending ? '认领中...' : '认领'}
                      </button>
                    )}
                  </>
                ) : undefined
              }
            >

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

            {/* KPI 串（4 卡一行）：商机 / 联系人 / 拜访 / 完整度 */}
            {!detailData._readonly && (
              <DetailKpiRow
                items={[
                  {
                    label: `活跃商机 / ${detailData.stats.projectCount}`,
                    value: detailData.stats.activeProjectCount,
                  },
                  {
                    label: `联系人 · 决策人 ${detailData.stats.decisionMakerCount}`,
                    value: detailData.stats.contactCount,
                  },
                  {
                    label: '拜访记录',
                    value: detailData.stats.visitCount,
                  },
                  {
                    label: '档案完整度',
                    value: `${completenessScore}%`,
                    tone: completenessScore >= 85 ? 'success' : completenessScore >= 60 ? 'warning' : 'danger',
                  },
                ]}
              />
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

            {/* 缺失字段（可点击 tag 打开编辑补充；完整度分值见 KPI 串；状态切换收进 ⋯ 菜单） */}
            {!detailData._readonly && missingFields && missingFields.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/20 bg-warning/5 px-3.5 py-2.5">
                <span className="flex items-center gap-1 text-xs font-medium text-warning">
                  <AlertTriangle size={13} /> 缺失字段 · 点击补充
                </span>
                {missingFields.map((field) => (
                  <button
                    key={field.field}
                    onClick={openEdit}
                    title="点击打开编辑表单补充该字段"
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-70 ${
                      field.severity === 'high' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'
                    }`}
                  >
                    {field.label} +
                  </button>
                ))}
              </div>
            )}

            {/* 基本档案（短字段两列栅格，长字段独占） */}
            <DetailSection title="基本档案">
              <DetailFieldGrid>
                <DetailField
                  label="行业"
                  value={company.industry ? industryLabels[company.industry] || company.industry : undefined}
                />
                <DetailField
                  label="等级"
                  value={company.level ? LEVEL_OPTIONS.find((l) => l.value === company.level)?.label || company.level : undefined}
                />
                <DetailField label="规模" value={company.scale} />
                <DetailField label="地区" value={company.region} />
                <DetailField label="来源" value={company.source ? sourceLabel(company.source) : undefined} />
                <DetailField label="联系人" value={company.contactPerson} />
                <DetailField label="电话" value={company.contactPhone} />
                <DetailField
                  label="官网"
                  span
                  value={
                    company.website ? (
                      <a href={company.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {company.website}
                      </a>
                    ) : undefined
                  }
                />
                <DetailField label="地址" value={company.address} span />
              </DetailFieldGrid>
            </DetailSection>

            {!detailData._readonly && (
              <>
                {/* 决策链角色矩阵（替代旧「联系信息」+「关联联系人」两张重复卡） */}
                <DetailSection
                  title={`决策链 · ${detailData.contacts.length} 人`}
                  icon={<Users size={14} />}
                  action={
                    <button
                      onClick={() => navigate('/contacts')}
                      className="text-xs text-primary hover:underline"
                      title="联系人管理"
                    >
                      全部联系人 →
                    </button>
                  }
                >
                  <DecisionChainMatrix
                    contacts={detailData.contacts}
                    onOpenContact={(id) => navigate(entityRouteTo('contact', id))}
                  />
                </DetailSection>

                {/* 关联商机（空模块折叠为占位条） */}
                <DetailCollapsible
                  title="关联商机"
                  icon={<FolderOpen size={14} />}
                  count={detailData.projects.length}
                  isEmpty={detailData.projects.length === 0}
                  emptyText="暂无关联商机"
                  emptyHint="该客户的线索转化后，商机将出现在这里"
                >
              <div className="space-y-2">
                {detailData.projects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(entityRouteTo('project', p.id))}
                    onClick={() => navigate(entityRouteTo('project', p.id))}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{p.name}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
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
                      <span className="shrink-0 text-[11px] text-text-tertiary">已关闭</span>
                    ) : (
                      <ArrowRight size={14} className="shrink-0 text-text-tertiary" />
                    )}
                  </div>
                ))}
              </div>
            </DetailCollapsible>

            {/* 近期拜访（空模块折叠为占位条） */}
            <DetailCollapsible
              title="近期拜访"
              icon={<Calendar size={14} />}
              count={detailData.visits?.length || 0}
              isEmpty={!detailData.visits || detailData.visits.length === 0}
              emptyText="暂无拜访记录"
              emptyHint="记录拜访后可在此回溯沟通历史"
            >
              <div className="space-y-2">
                {detailData.visits?.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setVisitDetailId(v.id)}
                    onClick={() => setVisitDetailId(v.id)}
                  >
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
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
            </DetailCollapsible>

            {/* 待办任务（空模块折叠为占位条） */}
            <DetailCollapsible
              title="待办任务"
              icon={<Flag size={14} />}
              count={detailData.tasks?.length || 0}
              isEmpty={!detailData.tasks || detailData.tasks.length === 0}
              emptyText="暂无待办任务"
              emptyHint="在任务页为该客户创建待办后显示在这里"
            >
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
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
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
            </DetailCollapsible>

            {/* Activity Feed */}
            {!detailData._readonly && (
              <>
                {/* 变更历史（空模块折叠为占位条） */}
                <DetailCollapsible
                  title="变更历史"
                  icon={<History size={14} />}
                  count={changeHistory?.length || 0}
                  isEmpty={!changeHistory || changeHistory.length === 0}
                  emptyText="暂无变更"
                  emptyHint="字段变更（手动 / AI）将在此留痕"
                >
                  <div className="space-y-2">
                      {changeHistory?.slice(0, 10).map((h) => (
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
                </DetailCollapsible>

                <TimelineView entityType="customer" entityId={detailData.company.id} title="客户时间轴" showProject />
              </>
            )}

            {/* 备注 */}
            {company.notes && (
              <DetailSection title="备注">
                <p className="whitespace-pre-wrap text-sm text-text-primary">{company.notes}</p>
              </DetailSection>
            )}
          </>
            )}
            </DetailLayout>
          )
        })()}
      </Stage>

      <VisitDetailDrawer visitId={visitDetailId} onClose={() => setVisitDetailId(undefined)} />

      <CustomerForm
        open={openForm}
        onClose={() => { setOpenForm(false); setEditingItem(undefined) }}
        initialData={editingItem?.company}
      />
      <LeadForm
        open={leadFormOpen}
        onClose={() => { setLeadFormOpen(false); setLeadFormCompanyId(undefined) }}
        prefilledCompanyId={leadFormCompanyId || detailId}
      />

      {confirmDialog.dialog}
    </div>
  )
}
