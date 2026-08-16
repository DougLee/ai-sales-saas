import { useState, useEffect } from 'react'
import { Plus, Loader2, Pencil, Trash2, ChevronLeft, ChevronRight, Calendar, Flag, AlertTriangle, Building2, Briefcase, Magnet, Search, ArrowUpRight, Check, Upload, Mic, Paperclip, XCircle, RefreshCw } from 'lucide-react'
import { useProjects, useProject, useDeleteProject, useUpdateProject, useUpdateGateField, useProjectMetrics, WAITING_STATUSES, type Project, type WaitingStatus } from '../hooks/use-projects.js'
import { useDecisionChain, useUpdateDecisionChain } from '../hooks/use-decision-chain.js'
import { DecisionChainMap } from '../components/projects/decision-chain-map.js'
import WaitingSection from '../components/projects/waiting-section.js'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useQueryClient } from '@tanstack/react-query'
import { entityRouteTo } from '../lib/entity-links.js'
import { DEFAULT_MILESTONE_GATE_RULES } from '@ai-sales/shared'
import { invalidateVisitRelated } from '../lib/invalidation.js'
import { Pagination } from '../components/ui/tabs.js'
import { useDebouncedValue } from '../hooks/use-debounced-value.js'
import AiEntryButton from '../components/ai/ai-entry-button.js'
import ProjectForm from '../components/forms/project-form.js'
import VisitForm from '../components/forms/visit-form.js'
import Drawer from '../components/ui/drawer.js'
import VisitDetailDrawer from '../components/visits/visit-detail-drawer.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { useConfirmDialog } from '../hooks/use-confirm-dialog.js'
import { TimelineView } from '../components/timeline/timeline-view.js'
import { DetailLayout, DetailCollapsible } from '../components/detail/detail-layout.js'

const milestoneLabels = [
  '初识客户', '明确痛点', '明确需求', '明确经费',
  '明确方案', '明确价格', '协助采购', '招标确认', '投标中标',
]

const urgencyMap: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: '紧急', color: 'bg-danger/10 text-danger' },
  HIGH: { label: '高', color: 'bg-warning/10 text-warning' },
  MEDIUM: { label: '中', color: 'bg-primary/10 text-primary' },
  LOW: { label: '低', color: 'bg-success/10 text-success' },
}

const taskStatusMap: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待办', color: 'bg-text-tertiary/10 text-text-tertiary' },
  IN_PROGRESS: { label: '进行中', color: 'bg-primary/10 text-primary' },
  COMPLETED: { label: '已完成', color: 'bg-success/10 text-success' },
  CANCELLED: { label: '已取消', color: 'bg-text-tertiary/10 text-text-tertiary line-through' },
}

const taskPriorityMap: Record<string, string> = {
  LOW: 'text-success',
  MEDIUM: 'text-warning',
  HIGH: 'text-danger',
  URGENT: 'text-danger font-bold',
}

// 各里程碑方法论要点（issue #32 配套简化 3：能否推进只看 gate，本清单仅保留方法论提示作用；
// 原 nextHint 推进条件文案已并入推进卡水位计数与推进按钮 title，不再两套口径并存）
const milestoneChecklists: Record<number, string[]> = {
  0: [
    '已建立初次联系（电话/拜访/引荐）',
    '已了解客户基本情况（学校规模、院系设置、信息化现状）',
    '已确认客户对AI教育的初步认知',
    '已约定下次沟通时间和主题',
  ],
  1: [
    '已识别 ≥1 个明确痛点（师资不足/平台卡顿/课程质量等）',
    '痛点已与客户关键人当面确认',
    '已记录痛点证据（客户原话/政策文件/现有问题截图）',
    '已评估各痛点的紧迫度和影响范围',
  ],
  2: [
    '需求已量化（覆盖学生规模、开课学期、学分要求）',
    '需求优先级已与客户共识排序',
    '已确认需求范围边界（哪些做/哪些不做）',
    '已获取客户对需求的签字/邮件确认',
  ],
  3: [
    '已确认预算来源（常规预算/专项经费/科研经费/自筹）',
    '已了解预算金额范围（上限/下限/心理价位）',
    '已明确审批流程（需要哪些人签字、几级审批）',
    '已识别关键审批人及其权力范围',
  ],
  4: [
    '已呈现针对该客户的定制化方案',
    '已完成技术交流/产品演示/案例参观',
    '已确认实施计划（时间线、交付内容、验收标准）',
    '已获取客户对方案的核心反馈（认可/修改意见）',
  ],
  5: [
    '已提交正式报价单（含明细和价格构成）',
    '已处理主要价格异议（与竞品对比/ROI论证）',
    '已确认合同核心条款（付款方式、交付周期、售后）',
    '已与客户达成价格共识（书面或邮件确认）',
  ],
  6: [
    '已协助客户完成采购申请文件',
    '已准备投标所需资质和材料',
    '已确认采购关键时间节点（挂网/开标/评标）',
    '已持续跟进采购进度，排除流程障碍',
  ],
  7: [
    '已确认招标参数有利于我方（或至少公平）',
    '已中标或评标结果明显倾向我方',
    '已准备合同签署所需全部文件',
    '已明确项目启动时间和首期交付内容',
  ],
  8: [
    '合同已正式签署并归档',
    '项目已启动（召开启动会、成立项目组）',
    '交付计划已与客户确认',
    '已制定客户成功/增购计划',
  ],
}

// 里程碑推进门控配置——单一真源 @ai-sales/shared（ADR-0004 决策 9：消除前后端手抄漂移）
const MILESTONE_GATES: Record<number, { requiredFields: Array<{ path: string; label: string; validate?: (val: unknown) => boolean }> }> =
  Object.fromEntries(
    DEFAULT_MILESTONE_GATE_RULES.map((rule) => [
      rule.fromStage,
      {
        // shared 类型是 字段|复合规则 联合；默认规则只含字段形态，复合形态展平子规则
        requiredFields: rule.requiredFields.flatMap((f) => {
          if ('path' in f) {
            return [{
              path: f.path,
              label: f.label,
              validate:
                f.validator === 'arrayMinLength'
                  ? (v: unknown) => Array.isArray(v) && v.length >= (f.params?.min ?? 1)
                  : undefined,
            }]
          }
          return f.rules.map((sub) => ('path' in sub ? {
            path: sub.path,
            label: sub.label,
            validate:
              sub.validator === 'arrayMinLength'
                ? (v: unknown) => Array.isArray(v) && v.length >= (sub.params?.min ?? 1)
                : undefined,
          } : { path: '', label: sub.label }))
        }),
      },
    ]),
  )

/** ADR-0005：gate 字段口语化文案（设计稿 v2）与验证要求档位（镜像后端 verification-tiers） */
const FIELD_COLLOQ: Record<string, { label: string; help: string; req: 'material' | 'cross' | 'decision' }> = {
  'humanInfo.firstContact': { label: '怎么认识的', help: '首次接触方式', req: 'material' },
  'humanInfo.painPoints': { label: '客户痛点', help: '至少 1 条，客户原话最佳', req: 'cross' },
  'businessInfo.requirements': { label: '需求量化', help: '覆盖规模 / 时间 / 功能', req: 'cross' },
  'financeInfo.budget': { label: '钱从哪来、多少', help: '预算来源与金额区间', req: 'cross' },
  'businessInfo.solution': { label: '方案要点', help: '客户认可的方案方向', req: 'decision' },
  'financeInfo.price': { label: '报价多少', help: '正式报价与依据', req: 'decision' },
  'decisionMap.nodes': { label: '关键拍板人', help: '决策链人物 ≥1 人', req: 'decision' },
  'evidence.bidResult': { label: '中标结果', help: '开标/评标结果', req: 'material' },
}
const REQ_NAME: Record<string, string> = { material: '需客观材料', cross: '需 ≥2 独立来源交叉', decision: '需决策人确认坐实' }
const LEVEL_RANK: Record<string, number> = { manual: 0, single: 1, cross: 2, final: 3 }
const REQ_LEVEL: Record<string, number> = { material: 1, cross: 2, decision: 3 }
const LEVEL_META: Record<string, { text: string; cls: string }> = {
  manual: { text: '自述·未验证', cls: 'bg-surface-elevated text-text-secondary' },
  single: { text: '单源·待确认', cls: 'bg-warning/10 text-warning' },
  cross: { text: '交叉验证', cls: 'bg-info/10 text-info' },
  final: { text: '坐实', cls: 'bg-success/10 text-success' },
}
/** 三段式（ADR-0005 决策 4）：育单 M0-2 / 谈单 M3-5 / 成单 M6-8 */
const SEGMENTS = [
  { from: 0, to: 2, name: '育单期', tip: '育单 · 摸清底细', color: 'bg-primary', text: 'text-primary', bg: 'bg-primary' },
  { from: 3, to: 5, name: '谈单期', tip: '谈单 · 拿下方案与价', color: 'bg-violet-600', text: 'text-violet-600', bg: 'bg-violet-600' },
  { from: 6, to: 8, name: '成单期', tip: '成单 · 走完采购', color: 'bg-success', text: 'text-success', bg: 'bg-success' },
]
function segOf(m: number) {
  return SEGMENTS.find((s) => m >= s.from && m <= s.to) ?? SEGMENTS[2]
}
/** 读取字段水位（兼容旧 string 结构） */
function readFieldMetas(evidence: Record<string, unknown> | null | undefined): Record<string, { level: string; sources: string[] }> {
  const raw = evidence?._gateFieldSource as Record<string, unknown> | undefined
  if (!raw) return {}
  const out: Record<string, { level: string; sources: string[] }> = {}
  for (const [path, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[path] = { level: v === 'manual-pass' ? 'final' : 'manual', sources: v === 'manual-pass' ? ['豁免'] : [] }
    else if (v && typeof v === 'object') {
      const m = v as { level?: string; sources?: string[] }
      out[path] = { level: m.level || 'manual', sources: Array.isArray(m.sources) ? m.sources : [] }
    }
  }
  return out
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

function isEmptyValue(val: unknown): boolean {
  if (val === null || val === undefined) return true
  if (typeof val === 'string' && val.trim() === '') return true
  if (Array.isArray(val) && val.length === 0) return true
  if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val as Record<string, unknown>).length === 0) return true
  return false
}

function checkGateCompletion(project: Project): { completed: boolean; missing: string[] } {
  const gate = MILESTONE_GATES[project.milestone]
  if (!gate || gate.requiredFields.length === 0) return { completed: true, missing: [] }
  const missing: string[] = []
  for (const field of gate.requiredFields) {
    const val = getNestedValue(project as unknown as Record<string, unknown>, field.path)
    const valid = field.validate ? field.validate(val) : !isEmptyValue(val)
    // 口径统一（issue #32）：缺失提示用销售语言（FIELD_COLLOQ），不暴露后端字段名
    if (!valid) missing.push(FIELD_COLLOQ[field.path]?.label ?? field.label)
  }
  return { completed: missing.length === 0, missing }
}

/** 沿 path 写入 value 的浅拷贝（一步提交：保存字段后用乐观快照复用推进 confirm 流程） */
function withNestedValue<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.')
  const clone: Record<string, unknown> = { ...(obj as Record<string, unknown>) }
  let cur = clone
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    const next = cur[k]
    cur[k] = next && typeof next === 'object' && !Array.isArray(next)
      ? { ...(next as Record<string, unknown>) }
      : {}
    cur = cur[k] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
  return clone as T
}

export default function Projects() {
  // 视图/筛选状态入 URL（审计 #18：刷新/分享不丢，对齐 leads 页标准）
  const [searchParams, setSearchParams] = useSearchParams()
  const setParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }
  const tab = searchParams.get('tab') || '全部'
  const setTab = (v: string) => setParam('tab', v === '全部' ? '' : v)
  const viewMode = (searchParams.get('view') as 'list' | 'board' | 'funnel') || 'board'
  const setViewMode = (v: 'list' | 'board' | 'funnel') => setParam('view', v === 'board' ? '' : v)
  // 看板默认三段三列（issue #32 配套简化 1）：折叠为默认态，展开 9 列才落 URL（collapsed=0）
  const collapsed = searchParams.get('collapsed') !== '0'
  const setCollapsed = (v: boolean) => setParam('collapsed', v ? '' : '0')
  const healthFilter = searchParams.get('health') || ''
  const setHealthFilter = (v: string) => setParam('health', v)
  const onlyStale = searchParams.get('stale') === '1'
  const setOnlyStale = (v: boolean) => setParam('stale', v ? '1' : '')
  const onlyWaiting = searchParams.get('waiting') === '1'
  const setOnlyWaiting = (v: boolean) => setParam('waiting', v ? '1' : '')
  const onlyIllusion = searchParams.get('illusion') === '1'
  const setOnlyIllusion = (v: boolean) => setParam('illusion', v ? '1' : '')
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const debouncedSearch = useDebouncedValue(search)
  const [open, setOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [rollbackReason, setRollbackReason] = useState('')
  const [loseOpen, setLoseOpen] = useState(false)
  const [loseReason, setLoseReason] = useState('')
  const [editingItem, setEditingItem] = useState<Partial<Project> | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [visitFormOpen, setVisitFormOpen] = useState(false)
  const [visitDetailId, setVisitDetailId] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const { data, isLoading, error } = useProjects({ search: debouncedSearch || undefined, page, pageSize: 50 })
  const { data: metrics } = useProjectMetrics()

  // 筛选变化回第一页
  useEffect(() => { setPage(1) }, [tab, healthFilter, onlyStale, onlyWaiting, onlyIllusion, debouncedSearch])
  const del = useDeleteProject()
  const gateField = useUpdateGateField(detailId)
  const update = useUpdateProject()
  const confirmDialog = useConfirmDialog()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // P0：详情不再用列表快照，走独立查询，操作后随 ['project', id] 失效自动刷新
  const { data: detailItem } = useProject(detailId)

  const projectId = searchParams.get('id')
  // 深链入口（?id=xxx）：打开详情，并把 id 一次性转换为 entityType/entityId（AI 上下文协议）。
  // 注意：两次 navigate 会互相竞争（后者取消前者），id 存在期间必须由本 effect 独占写 URL，
  // 否则下面的同步 effect 会用旧 location 计算，把已删除的 id 复活，导致抽屉关不掉
  useEffect(() => {
    if (!projectId) return
    setDetailId(projectId)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('id')
        next.set('entityType', 'project')
        next.set('entityId', projectId)
        return next
      },
      { replace: true },
    )
  }, [projectId, setSearchParams])

  // 当详情 Drawer 打开/关闭时，同步更新 URL 中的 entityType/entityId
  // （?id= 深链转换期间让路给上面的 effect；已同步则不再重复 navigate）
  useEffect(() => {
    if (!detailId || projectId) return
    if (searchParams.get('entityId') === detailId && searchParams.get('entityType') === 'project') return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('entityType', 'project')
        next.set('entityId', detailId)
        return next
      },
      { replace: true },
    )
  }, [detailId, projectId, searchParams, setSearchParams])

  const handleCloseDetail = () => {
    setDetailId(undefined)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('id')
        next.delete('entityType')
        next.delete('entityId')
        return next
      },
      { replace: true },
    )
  }

  const handleEdit = (project: Project) => {
    setEditingItem(project)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog.confirm({
      title: '删除商机',
      description: '删除后不可恢复，确定删除这个商机吗？',
      confirmLabel: '删除',
      danger: true,
    }))) return
    del.mutate(id)
  }

  const handleAdvanceMilestone = async (project: Project) => {
    if (project.milestone >= 8) return
    const gateStatus = checkGateCompletion(project)
    if (!gateStatus.completed) return
    // ADR-0005 决策 3：弱锚定警示（字段有值但水位不足 → 放行但提醒）
    const metas = readFieldMetas(project.evidence)
    const gate = MILESTONE_GATES[project.milestone]
    const below = (gate?.requiredFields ?? []).filter((f) => {
      const meta = metas[f.path]
      return (meta ? LEVEL_RANK[meta.level] ?? 0 : 0) < REQ_LEVEL[FIELD_COLLOQ[f.path]?.req ?? 'material']
    })
    const weak = below.length > 0
    if (!(await confirmDialog.confirm({
      title: weak ? '弱锚定推进' : '推进里程碑',
      description: `确定将「${project.name}」从「${milestoneLabels[project.milestone]}」推进到「${milestoneLabels[project.milestone + 1]}」吗？` + (weak ? `\n\n⚠ ${below.map((b) => FIELD_COLLOQ[b.path]?.label ?? b.label).join('、')} 未达验证水位，本次推进将标记为弱锚定——后续材料到达可补强。` : ''),
      confirmLabel: '推进',
    }))) return
    update.mutate({ id: project.id, data: { milestone: project.milestone + 1 } })
  }

  // ADR-0004 决策 4：回退需填原因（必填，时间轴留痕）——内联表单收集原因
  const handleRollbackSubmit = (project: Project) => {
    if (!rollbackReason.trim() || project.milestone <= 0) return
    update.mutate(
      { id: project.id, data: { milestone: project.milestone - 1, backReason: rollbackReason.trim() } as never },
      { onSuccess: () => { setRollbackOpen(false); setRollbackReason('') } },
    )
  }

  // 赢单/流失闭环（ADR-0004 决策 8）：流失必填原因，重新激活清 closedAt
  const handleMarkWon = async (project: Project) => {
    if (!(await confirmDialog.confirm({
      title: '标记赢单',
      description: `确定「${project.name}」赢单吗？将记录成交时间，转化率③随之更新。`,
      confirmLabel: '确认赢单',
    }))) return
    update.mutate({ id: project.id, data: { status: 'won' } as never })
  }

  const handleLoseSubmit = (project: Project) => {
    if (!loseReason.trim()) return
    update.mutate(
      { id: project.id, data: { status: 'lost', lostInfo: { reason: loseReason.trim() } } as never },
      { onSuccess: () => { setLoseOpen(false); setLoseReason('') } },
    )
  }

  const handleReactivate = async (project: Project) => {
    if (!(await confirmDialog.confirm({
      title: '重新激活',
      description: `将「${project.name}」恢复为跟进中（清除关单时间）？`,
      confirmLabel: '激活',
    }))) return
    update.mutate({ id: project.id, data: { status: 'following' } as never })
  }

  const handleClose = () => {
    setOpen(false)
    setEditingItem(undefined)
  }

  const filteredItems = data?.items.filter((p) => {
    if (tab === '跟进中' && p.closedAt) return false
    if (tab === '已签约' && !(p.closedAt && !p.lostInfo)) return false
    if (tab === '已流失' && !p.lostInfo) return false
    // 推导筛选（ADR-0003）：停滞/等待/幻觉分家
    const d = p.derivation
    if (onlyStale && !(d && d.staleDays > 0 && !d.waiting)) return false
    if (onlyWaiting && !d?.waiting) return false
    if (onlyIllusion && !d?.illusion) return false
    if (healthFilter === 'low' && (p.healthScore ?? 100) >= 40) return false
    if (healthFilter === 'mid' && ((p.healthScore ?? 100) < 40 || (p.healthScore ?? 0) >= 70)) return false
    if (healthFilter === 'high' && (p.healthScore ?? 0) < 70) return false
    return true
  }) || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-text-primary">商机推进</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">L2 · 立项推进层</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-elevated p-1">
            <button onClick={() => setViewMode('board')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === 'board' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>看板</button>
            <button onClick={() => setViewMode('list')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>列表</button>
            <button onClick={() => setViewMode('funnel')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === 'funnel' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>漏斗</button>
          </div>
          <button
            onClick={() => navigate('/leads')}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
            title="商机由满足转化条件的线索生成，不支持直接新建"
          >
            <Magnet size={15} /> 商机由线索转化
          </button>
          <AiEntryButton
            prompt="帮我看看当前商机 Pipeline，哪些需要优先推进"
            label="问小销"
            variant="primary"
            className="rounded-xl px-4 py-2 text-sm"
          />
        </div>
      </div>

      {/* 指标条六格（脱水是灵魂，C 位黄卡） */}
      {metrics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xl font-bold text-text-primary">{metrics.active}</p>
            <p className="mt-0.5 text-xs text-text-secondary">在途商机</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xl font-bold text-text-primary">¥{metrics.nominalAmount}<span className="text-xs font-normal">万</span></p>
            <p className="mt-0.5 text-xs text-text-secondary">名义管线金额</p>
          </div>
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
            <p className="text-xl font-bold text-warning">¥{metrics.dehydratedAmount}<span className="text-xs font-normal">万</span></p>
            <p className="mt-0.5 text-[11px] font-semibold text-warning">脱水率 {metrics.dehydrationRate}%</p>
            <p className="text-[11px] text-text-tertiary">AI 脱水后真实可预测</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className={`text-xl font-bold ${metrics.stale > 0 ? 'text-danger' : 'text-text-primary'}`}>{metrics.stale}</p>
            <p className="mt-0.5 text-xs text-text-secondary">停滞中（超阈值未推进）</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xl font-bold text-primary">{metrics.waitingCount}</p>
            <p className="mt-0.5 text-xs text-text-secondary">合理等待（招标/预算/审批）</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xl font-bold text-success">{metrics.conversionRate3}%</p>
            <p className="mt-0.5 text-xs text-text-secondary">转化率③（商机→赢单，季度）</p>
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
            placeholder="搜索商机 / 客户"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
          />
        </div>
        <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary outline-none focus:border-primary cursor-pointer" title="健康度">
          <option value="">健康度：全部</option>
          <option value="high">≥70 健康</option>
          <option value="mid">40-70 观察</option>
          <option value="low">&lt;40 高危</option>
        </select>
        {([
          { on: onlyStale, set: setOnlyStale, label: '只看停滞', cls: 'border-danger/40 bg-danger/10 text-danger' },
          { on: onlyWaiting, set: setOnlyWaiting, label: '只看等待', cls: 'border-primary/40 bg-primary/10 text-primary' },
          { on: onlyIllusion, set: setOnlyIllusion, label: '疑似幻觉', cls: 'border-danger/40 bg-danger/10 text-danger' },
        ] as const).map((c) => (
          <button
            key={c.label}
            onClick={() => c.set(!c.on)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${c.on ? `${c.cls} font-semibold` : 'border-border bg-surface text-text-tertiary hover:text-text-secondary'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-1">
            {(['全部', '跟进中', '已签约', '已流失'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  tab === t ? 'bg-primary/10 font-medium text-primary' : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {viewMode === 'board' && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
              title="9 列横滚 / 三阶段折叠切换（决策⑧）"
            >
              {collapsed ? '展开 9 列' : '折叠为三阶段'}
            </button>
          )}
        </div>

        {isLoading && <LoadingState />}

        {error && <ErrorState message={(error as Error).message || '加载失败'} />}

        {!isLoading && !error && filteredItems.length === 0 && (
          <EmptyState
            icon={Magnet}
            title="暂无商机"
            description="商机由满足条件（人/事/财齐备）的线索转化而来，不支持直接新建。先去线索页创建并培育线索吧。"
            action={
              <button
                onClick={() => navigate('/leads')}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                <Plus size={16} /> 去创建线索
              </button>
            }
          />
        )}

        {!isLoading && !error && filteredItems.length > 0 && viewMode === 'board' && (
          <ProjectBoard
            projects={filteredItems}
            onSelect={(p) => setDetailId(p.id)}
            onAdvance={handleAdvanceMilestone}
            collapsed={collapsed}
          />
        )}

        {!isLoading && !error && (data?.items.length ?? 0) > 0 && viewMode === 'funnel' && (
          <ProjectFunnel projects={data?.items || []} />
        )}

        {!isLoading && (data?.total ?? 0) > 0 && (data?.items.length ?? 0) > 0 && (
          <Pagination
            page={page}
            totalPages={Math.max(Math.ceil((data?.total ?? 0) / 50), 1)}
            onChange={setPage}
            totalLabel={`共 ${data?.total ?? 0} 条商机`}
          />
        )}

        {!isLoading && !error && filteredItems.length > 0 && viewMode === 'list' && (
          <div className="divide-y divide-border">
            {filteredItems.map((project) => (
              <div key={project.id} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setDetailId(project.id)} className="flex items-center justify-between px-6 py-4 hover:bg-surface-elevated/50 transition-colors cursor-pointer" onClick={() => setDetailId(project.id)}>
                <div>
                  <p className="font-medium text-text-primary">
                    {project.name}
                    {project.derivation?.illusion && (
                      <span className="ml-1.5 rounded-md border border-danger/40 bg-danger/5 px-1 text-[11px] font-medium text-danger">疑似幻觉</span>
                    )}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {project.company?.name ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (project.company?.id) navigate(entityRouteTo('customer', project.company.id)) }}
                        className="text-primary hover:underline"
                      >
                        {project.company.name}
                      </button>
                    ) : '无关联客户'} · {milestoneLabels[project.milestone] ?? '未知阶段'}
                    {project.derivation?.staleDays ? <span className="ml-2 text-danger">停滞 {project.derivation.staleDays} 天</span> : null}
                    {project.derivation?.nextAction && (
                      <span className="ml-2 text-text-tertiary">▶ {project.derivation.nextAction.title}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  {project.waitingStatus && (
                    <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                      {WAITING_STATUSES[project.waitingStatus as WaitingStatus] || '等待中'}
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    project.urgency === 'CRITICAL' ? 'bg-danger/10 text-danger' :
                    project.urgency === 'HIGH' ? 'bg-warning/10 text-warning' :
                    project.urgency === 'MEDIUM' ? 'bg-primary/10 text-primary' :
                    'bg-success/10 text-success'
                  }`}>
                    {urgencyMap[project.urgency]?.label || project.urgency}
                  </span>
                  {project.healthScore != null && (
                    <span className="text-sm text-text-secondary">{project.healthScore}分</span>
                  )}
                  <button
                    onClick={() => handleEdit(project)}
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
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

      <ProjectForm open={open} onClose={handleClose} initialData={editingItem} />

      {/* 商机详情（D3 工作台 lg 双栏：头区主行动「提交推进材料」+ 左栏推进卡主线 + 右栏 AI 作战室） */}
      <Drawer open={!!detailId} onClose={handleCloseDetail} title="商机详情" size="lg">
        {detailId && !detailItem && <LoadingState />}
        {detailItem && (
          <DetailLayout
            title={detailItem.name}
            badges={
              <>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">L2 · 商机</span>
                {detailItem.healthScore != null && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    detailItem.healthScore >= 70 ? 'bg-success/10 text-success' : detailItem.healthScore >= 40 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'
                  }`}>健康 {detailItem.healthScore}</span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${urgencyMap[detailItem.urgency]?.color || ''}`}>
                  {urgencyMap[detailItem.urgency]?.label || detailItem.urgency}
                </span>
                {detailItem.derivation?.illusion && (
                  <span className="rounded-full border border-dashed border-danger px-2 py-0.5 text-[11px] font-semibold text-danger">疑似幻觉</span>
                )}
                {detailItem.closedAt && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${detailItem.status === 'won' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                    {detailItem.status === 'won' ? '已赢单' : '已流失'}
                  </span>
                )}
              </>
            }
            meta={
              <>
                <span className="flex items-center gap-0.5">
                  商机推进 <ChevronRight size={10} /> M{detailItem.milestone} {milestoneLabels[detailItem.milestone]}
                </span>
                {detailItem.company?.name && (
                  <button
                    onClick={() => navigate(entityRouteTo('customer', detailItem.company!.id))}
                    className="flex items-center gap-0.5 text-primary hover:underline"
                  >
                    <Building2 size={11} /> {detailItem.company.name}
                  </button>
                )}
                {detailItem.industry && (
                  <span className="flex items-center gap-0.5"><Briefcase size={11} /> {detailItem.industry}</span>
                )}
                {detailItem.sourceLeadId && detailItem.milestone > 0 && (
                  <button
                    onClick={() => navigate(`/leads?id=${detailItem.sourceLeadId}`)}
                    className="flex items-center gap-0.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success transition-colors hover:bg-success/20"
                    title="查看来源线索"
                  >
                    <ArrowUpRight size={10} /> 线索转化定级落位
                  </button>
                )}
              </>
            }
            primary={
              !detailItem.closedAt ? (
                <button
                  onClick={() => setVisitFormOpen(true)}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                  title="记录/上传拜访材料，AI 提取当前阶段关键信息并自动验证"
                >
                  <Upload size={14} /> 提交推进材料
                </button>
              ) : undefined
            }
            menu={[
              // 闭环操作（ADR-0004 决策 8）收进 ⋯ 菜单：赢单 / 流失 / 重新激活
              ...(!detailItem.closedAt
                ? [
                    { key: 'won', label: '标记赢单', icon: <Check size={14} />, onSelect: () => handleMarkWon(detailItem) },
                    { key: 'lost', label: '标记流失', icon: <XCircle size={14} />, danger: true, onSelect: () => setLoseOpen(true) },
                  ]
                : [
                    { key: 'reactivate', label: '重新激活', icon: <RefreshCw size={14} />, onSelect: () => handleReactivate(detailItem) },
                  ]),
            ]}
          >

            {/* 流失原因内联表单（ADR-0004 决策 8） */}
            {loseOpen && !detailItem.closedAt && (
              <div className="space-y-2 rounded-xl border border-danger/20 bg-danger/5 p-3">
                <p className="text-xs text-danger">标记流失（必填原因，将记录到时间轴）</p>
                <textarea
                  value={loseReason}
                  onChange={(e) => setLoseReason(e.target.value)}
                  rows={2}
                  aria-label="流失原因"
                  placeholder="如：客户选择了竞品 / 预算取消 / 需求暂停"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-danger"
                />
                <div className="flex gap-2">
                  <button onClick={() => { setLoseOpen(false); setLoseReason('') }} className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated">取消</button>
                  <button
                    onClick={() => handleLoseSubmit(detailItem)}
                    disabled={update.isPending || !loseReason.trim()}
                    className="flex-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/90 disabled:opacity-50"
                  >
                    {update.isPending ? '提交中...' : '确认流失'}
                  </button>
                </div>
              </div>
            )}

            {/* 等待状态（V6.1 §7.2：流程性等待不计停滞） */}
            <WaitingSection projectId={detailItem.id} />

            {/* 真假条（ADR-0003：值多少钱/扎不扎实/动不动）——压缩为 4 卡一行；决策链计数见右栏 */}
            {(() => {
              const d = detailItem.derivation
              const daysSince = d ? Math.floor((Date.now() - new Date(detailItem.updatedAt).getTime()) / 86400000) : 0
              const coverage = d ? Math.min(100, Math.round((d.evidenceCount / (detailItem.milestone + 1)) * 100)) : 0
              return (
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-lg font-bold text-text-primary">¥{detailItem.amount ?? '-'}<span className="text-xs font-normal">万</span></p>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">预估金额</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className={`text-lg font-bold ${
                      (detailItem.healthScore ?? 0) >= 70 ? 'text-success' : (detailItem.healthScore ?? 0) >= 40 ? 'text-warning' : 'text-danger'
                    }`}>{detailItem.healthScore ?? '-'}</p>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">健康度（右栏 AI 拆解）</p>
                  </div>
                  <div className={`rounded-xl border p-3 ${coverage >= 60 ? 'border-border bg-background' : 'border-warning/40 bg-warning/5'}`}>
                    <p className={`text-lg font-bold ${coverage >= 60 ? 'text-text-primary' : 'text-warning'}`}>{d?.evidenceCount ?? 0}<span className="text-xs font-normal">条</span></p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
                      <div className={`h-full rounded-full ${coverage >= 60 ? 'bg-success' : 'bg-warning'}`} style={{ width: `${coverage}%` }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">证据链 · 脱水校验覆盖 {coverage}%</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    {d?.waiting ? (
                      <p className="text-lg font-bold text-primary">等待中</p>
                    ) : d && d.staleDays > 0 ? (
                      <p className="text-lg font-bold text-danger">停滞 {d.staleDays} 天</p>
                    ) : (
                      <p className="text-lg font-bold text-success">活跃</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-text-tertiary">
                      {daysSince > 0 ? `${daysSince} 天前有推进` : '今天有推进'}
                      {d?.nextAction ? ` · ▶ ${d.nextAction.title}` : ''}
                    </p>
                  </div>
                </div>
              )
            })()}

            {/* Two-column layout */}
            <div className="grid grid-cols-5 gap-5">
              {/* Left: progress + checklist + decision chain */}
              <div className="col-span-3 space-y-5">
                {/* 推进卡 v2（ADR-0005）：段形进度条 + 统一材料入口 + 水位推进 */}
                <div className="rounded-xl border border-border bg-background p-4">
                  {(() => {
                    const m = detailItem.milestone
                    const seg = segOf(m)
                    const anchors = (detailItem.evidence?._anchors as Record<string, string>) || {}
                    const gate = MILESTONE_GATES[m]
                    const metas = readFieldMetas(detailItem.evidence)
                    const gateStatus = checkGateCompletion(detailItem)
                    // 水位：字段有值但 level < 要求 → 未达标数
                    const belowReq = (gate?.requiredFields ?? []).filter((f) => {
                      const meta = metas[f.path]
                      const lv = meta ? LEVEL_RANK[meta.level] ?? 0 : 0
                      return lv < REQ_LEVEL[FIELD_COLLOQ[f.path]?.req ?? 'material']
                    })
                    return (
                      <>
                        {/* 推进卡头：M 色块 + 当前/下一格 + 段 tag */}
                        <div className="flex items-center gap-3">
                          <div className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-white ${seg.bg}`}>
                            <b className="text-base leading-none">M{m}</b>
                            <i className="mt-0.5 text-[9px] not-italic opacity-85">当前</i>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold text-text-primary">{milestoneLabels[m]}</p>
                            <p className="text-xs text-text-tertiary">
                              {m < 8 ? `下一格：M${m + 1} ${milestoneLabels[m + 1]}` : '终点 · 转入客户成功'}
                            </p>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${seg.name === '育单期' ? 'bg-primary/10 text-primary' : seg.name === '谈单期' ? 'bg-violet-600/10 text-violet-600' : 'bg-success/10 text-success'}`}>
                            {seg.tip}
                          </span>
                        </div>

                        {/* 段形进度条 + ticks（强弱锚定） */}
                        <div className="mt-4">
                          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                            {SEGMENTS.flatMap((s) =>
                              Array.from({ length: s.to - s.from + 1 }, (_, k) => {
                                const idx = s.from + k
                                return <div key={idx} className={`flex-1 rounded-sm ${idx <= m ? s.color : 'bg-border'}`} style={{ opacity: idx <= m ? 1 : 0.5 }} />
                              }),
                            )}
                          </div>
                          <div className="relative mt-2.5">
                            <div className="absolute left-0 top-[9px] h-0.5 w-full bg-border" />
                            <div className="relative flex justify-between">
                              {milestoneLabels.map((label, i) => {
                                const iseg = segOf(i)
                                const anchor = anchors[i] || anchors[String(i)]
                                return (
                                  <div key={i} className="flex w-[11%] flex-col items-center gap-1" title={label}>
                                    <div
                                      className={`relative z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold transition-all ${
                                        i < m ? `${iseg.color} text-white`
                                        : i === m ? `${iseg.color} scale-[1.15] text-white ring-4 ring-primary/15`
                                        : 'border-[1.5px] border-border bg-surface-elevated text-text-tertiary'
                                      }`}
                                    >
                                      {i < m ? <Check size={10} /> : i + 1}
                                    </div>
                                    <span className={`whitespace-nowrap text-[10px] ${i === m ? 'font-semibold text-text-primary' : 'text-text-tertiary'}`}>
                                      {i === m ? label : `M${i}`}
                                    </span>
                                    {/* 锚定标记（ADR-0005 决策 3）：强/弱 */}
                                    <span className="flex h-[10px] items-center text-[9px] leading-none">
                                      {i < m && (anchor === 'strong' || anchor === 'weak') ? (
                                        <span className={anchor === 'strong' ? 'text-success' : 'text-warning'} title={anchor === 'strong' ? '强锚定：全部字段达验证水位' : '弱锚定：含未验证信息，材料到达可补强'}>
                                          ⚓ {anchor === 'strong' ? '强' : '弱'}
                                        </span>
                                      ) : null}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <div className="mt-1.5 flex border-t-2 border-transparent">
                            {SEGMENTS.map((s) => (
                              <span key={s.name} className="flex-1 pt-1.5 text-center text-[11px] font-semibold" style={{ width: `${((s.to - s.from + 1) / 9) * 100}%` }}>
                                <span className={s.text}>{s.tip}</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* 统一材料提交区（v2 核心：一卡一入口） */}
                        <div className="mt-4 rounded-[10px] border-[1.5px] border-dashed border-primary bg-primary/5 p-3">
                          <p className="flex items-center gap-2 text-[13px] font-bold text-primary">
                            <Upload size={14} /> 提交本次推进材料（唯一入口）
                          </p>
                          <p className="mt-0.5 text-[11px] text-text-secondary">
                            拜访录音、方案文档、微信沟通截图——交上来就行，AI 提取当前阶段关键信息并自动验证
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => setVisitFormOpen(true)}
                              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-hover"
                            >
                              <Mic size={13} /> 记录/上传材料
                            </button>
                          </div>
                          <p className="mt-2 flex flex-wrap items-center gap-1 text-[10.5px] text-text-tertiary">
                            材料提交 <span className="text-primary">→</span> AI 提取（客观原文） <span className="text-primary">→</span> 确认队列（低风险自动生效） <span className="text-primary">→</span> 第二来源交叉 <span className="text-primary">→</span> 字段点亮
                          </p>
                        </div>

                        {/* 阶段档案（水位版） */}
                        {gate && gate.requiredFields.length > 0 && (
                          <div className="mt-3 space-y-1 rounded-lg border border-border bg-surface p-3">
                            <p className="mb-1 text-xs font-medium text-text-secondary">本阶段门禁字段（验证水位）</p>
                            <GateFieldPanel
                              project={detailItem}
                              fields={gate.requiredFields}
                              gateField={gateField}
                              onAdvance={handleAdvanceMilestone}
                            />
                          </div>
                        )}

                        {/* 底部：水位计数 + 推进/回退 */}
                        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2.5">
                          <p className="flex-1 text-xs text-text-tertiary">
                            {m >= 8 ? '已到终点'
                            : !gateStatus.completed ? <>推进条件 <b className="text-warning">{gate.requiredFields.length - gateStatus.missing.length}/{gate.requiredFields.length}</b> · 提交材料或填写后点亮</>
                            : belowReq.length > 0 ? <>可推进 · <b className="text-warning">{belowReq.length} 项未达验证水位</b>（将弱锚定）</>
                            : <><b className="text-success">全部字段已达验证水位</b> · 强锚定推进</>}
                          </p>
                          <div className="flex items-center gap-1">
                            {m > 0 && (
                              <button
                                onClick={() => setRollbackOpen((v) => !v)}
                                disabled={update.isPending}
                                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                                title="回退到上一里程碑（需填原因，留痕）"
                              >
                                <ChevronLeft size={12} /> 回退
                              </button>
                            )}
                            <button
                              onClick={() => handleAdvanceMilestone(detailItem)}
                              disabled={update.isPending || !gateStatus.completed || m >= 8}
                              className="flex items-center gap-1 rounded-lg bg-primary px-5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-text-tertiary"
                              title={gateStatus.completed ? (belowReq.length > 0 ? '含未验证字段，将弱锚定推进' : '全部字段验证达标，强锚定推进') : `补齐后可推进（提交材料由 AI 提取，或点填写）：${gateStatus.missing.join('、')}`}
                            >
                              {update.isPending ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                              推进到 M{m + 1}
                            </button>
                          </div>
                        </div>

                        {/* 回退原因内联表单（ADR-0004 决策 4） */}
                        {rollbackOpen && detailItem.milestone > 0 && (
                          <div className="mt-3 space-y-2 rounded-lg border border-danger/20 bg-danger/5 p-3">
                            <p className="text-xs text-danger">
                              回退 M{detailItem.milestone} → M{detailItem.milestone - 1}（必填原因，将记录到时间轴）
                            </p>
                            <textarea
                              value={rollbackReason}
                              onChange={(e) => setRollbackReason(e.target.value)}
                              rows={2}
                              placeholder="如：客户需求范围变更，需重新确认需求指标"
                              aria-label="回退原因"
                              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-danger"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setRollbackOpen(false); setRollbackReason('') }}
                                className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated"
                              >
                                取消
                              </button>
                              <button
                                onClick={() => handleRollbackSubmit(detailItem)}
                                disabled={update.isPending || !rollbackReason.trim()}
                                className="flex-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/90 disabled:opacity-50"
                              >
                                {update.isPending ? '回退中...' : '确认回退'}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>

                {/* 本阶段方法论要点（issue #32 配套简化 3）：轻量折叠卡，默认收起；
                    「能否推进」只看推进卡 gate（单一标准），此处仅保留方法论提示 */}
                {(() => {
                  const points = milestoneChecklists[detailItem.milestone]
                  if (!points) return null
                  return (
                    <details className="rounded-xl border border-border bg-background p-4">
                      <summary className="cursor-pointer select-none text-sm font-medium text-text-secondary">
                        本阶段方法论要点 · M{detailItem.milestone} {milestoneLabels[detailItem.milestone]}
                      </summary>
                      <div className="mt-3 space-y-2">
                        {points.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <div className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
                            <span className="text-xs text-text-secondary leading-relaxed">{item}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2.5 text-[10.5px] text-text-tertiary">方法论参考，不参与校验；能否推进以上方推进卡门禁字段为准</p>
                    </details>
                  )
                })()}

              </div>

              {/* Right: AI 作战室 + timeline + visits + tasks */}
              <div className="col-span-2 space-y-5">
                {/* AI 作战室（设计稿 20260813）：健康度拆解 + 下一步建议 */}
                <div className="rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-primary">AI 作战室</h4>
                    <AiEntryButton
                      prompt={`商机「${detailItem.name}」当前 ${milestoneLabels[detailItem.milestone]}，健康度 ${detailItem.healthScore ?? '未知'}，请给我本阶段的作战建议：下一步动作、风险点、话术要点`}
                      label="问小销"
                      variant="primary"
                      entityType="project"
                      entityId={detailItem.id}
                    />
                  </div>
                  {detailItem.healthRadar && Array.isArray(detailItem.healthRadar) && detailItem.healthRadar.length > 0 && (
                    <div className="space-y-1.5">
                      {detailItem.healthRadar.map((dim: { name?: string; label?: string; score?: number }) => (
                        <div key={dim.name || dim.label} className="flex items-center gap-2 text-xs">
                          <span className="w-16 shrink-0 text-text-secondary">{dim.label || dim.name}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded bg-border">
                            <i
                              className={`block h-full rounded ${(dim.score ?? 0) >= 60 ? 'bg-success' : (dim.score ?? 0) >= 40 ? 'bg-warning' : 'bg-danger'}`}
                              style={{ width: `${Math.min(dim.score ?? 0, 100)}%` }}
                            />
                          </span>
                          <span className="w-8 shrink-0 text-right text-text-tertiary">{dim.score ?? '-'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(() => {
                    // 口径统一（issue #32）：建议文案改由 gate 缺失字段推导，不再引用 checklist nextHint 旧口径
                    if (detailItem.milestone >= 8) {
                      return (
                        <div className="mt-2.5 rounded-lg bg-surface p-2.5 text-xs text-text-secondary">
                          <b className="text-primary">AI 建议：</b>已到终点，重点转向交付实施与客户成功，挖掘增购和转介绍机会
                        </div>
                      )
                    }
                    const gs = checkGateCompletion(detailItem)
                    return (
                      <div className="mt-2.5 rounded-lg bg-surface p-2.5 text-xs text-text-secondary">
                        <b className="text-primary">AI 建议：</b>
                        {gs.completed
                          ? `本阶段材料已齐备，可推进到 M${detailItem.milestone + 1} ${milestoneLabels[detailItem.milestone + 1]}`
                          : `先补齐「${gs.missing.join('、')}」，提交材料由 AI 提取或点填写；补齐后即可推进到 M${detailItem.milestone + 1}`}
                      </div>
                    )
                  })()}
                </div>

                {/* 决策链（从左栏移入：右栏 = AI 作战室 + 决策链 + 折叠活动区） */}
                <DecisionChainSection projectId={detailItem.id} companyId={detailItem.company?.id} companyName={detailItem.company?.name} />

                {/* 时间轴视图（V6.1 Phase 5：类型筛选 + 滚动加载，待确认事件不显示） */}
                <TimelineView entityType="project" entityId={detailItem.id} title="项目时间轴" />

                {/* 近期拜访（空模块折叠为占位条） */}
                <DetailCollapsible
                  title="近期拜访"
                  icon={<Calendar size={14} />}
                  count={detailItem.visits?.length || 0}
                  isEmpty={!detailItem.visits || detailItem.visits.length === 0}
                  emptyText="暂无拜访记录"
                  emptyHint="点「提交推进材料」记录拜访，AI 自动提取关键信息"
                >
                  <div className="space-y-2">
                    {detailItem.visits?.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
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
                          <p className="text-xs text-text-tertiary">{new Date(v.visitTime).toLocaleString('zh-CN')}</p>
                        </div>
                        {v.contactName && (
                          <span className="shrink-0 text-xs text-text-secondary">{v.contactName}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </DetailCollapsible>

                {/* 关联任务（空模块折叠为占位条） */}
                <DetailCollapsible
                  title="关联任务"
                  icon={<Flag size={14} />}
                  count={detailItem.tasks?.length || 0}
                  isEmpty={!detailItem.tasks || detailItem.tasks.length === 0}
                  emptyText="暂无关联任务"
                  emptyHint="在任务页或 AI 跟进中创建的待办将显示在这里"
                >
                  <div className="space-y-2">
                    {detailItem.tasks?.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
                        <Flag size={12} className={taskPriorityMap[t.priority] || 'text-text-tertiary'} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${t.status === 'COMPLETED' || t.status === 'CANCELLED' ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>
                            {t.title}
                          </p>
                          {t.deadline && (
                            <p className="text-xs text-text-tertiary">截止：{new Date(t.deadline).toLocaleDateString('zh-CN')}</p>
                          )}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${taskStatusMap[t.status]?.color || ''}`}>
                          {taskStatusMap[t.status]?.label || t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </DetailCollapsible>
              </div>
            </div>

            {/* Notes */}
            {detailItem.notes && (
              <div className="rounded-xl border border-border bg-background p-4">
                <h4 className="mb-2 text-sm font-medium text-text-secondary">备注</h4>
                <p className="whitespace-pre-wrap text-sm text-text-primary">{detailItem.notes}</p>
              </div>
            )}

            {/* Stale warning */}
            {detailItem.isStale && (
              <div className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/5 p-3 text-warning">
                <AlertTriangle size={16} />
                <span className="text-sm">该商机已停滞，建议尽快安排跟进</span>
              </div>
            )}
          </DetailLayout>
        )}
      </Drawer>

      <VisitDetailDrawer visitId={visitDetailId} onClose={() => setVisitDetailId(undefined)} />

      <VisitForm
        open={visitFormOpen}
        onClose={(created) => {
          setVisitFormOpen(false)
          // 录完拜访后走失效矩阵（详情/列表/指标/任务/看板联动刷新，审计 #12）
          if (created && detailId) {
            invalidateVisitRelated(queryClient, { visitId: undefined, projectId: detailId })
          }
        }}
        initialData={
          detailItem
            ? {
                projectId: detailItem.id,
                project: { name: detailItem.name },
                companyId: detailItem.company?.id,
                company: detailItem.company,
              }
            : undefined
        }
      />

      {confirmDialog.dialog}
    </div>
  )
}

/** 三段式（ADR-0005 决策 4）：育单 M0-2 / 谈单 M3-5 / 成单 M6-8 */
const PHASES = [
  { name: '育单 · 摸清底细', cls: 'border-t-primary', range: [0, 2], label: 'bg-primary' },
  { name: '谈单 · 拿下方案与价', cls: 'border-t-violet-600', range: [3, 5], label: 'bg-violet-600' },
  { name: '成单 · 走完采购', cls: 'border-t-success', range: [6, 8], label: 'bg-success' },
] as const

function phaseOf(milestone: number) {
  return PHASES.find((p) => milestone >= p.range[0] && milestone <= p.range[1]) || PHASES[0]
}

/** 商机卡（设计稿：每张卡回答值多少钱/扎不扎实/动不动/下一步） */
function ProjectCard({ project, onSelect, onAdvance }: {
  project: Project
  onSelect: (p: Project) => void
  onAdvance: (p: Project) => void
}) {
  const gateStatus = checkGateCompletion(project)
  const d = project.derivation
  const hs = project.healthScore
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(project)}
      onClick={() => onSelect(project)}
      className={`cursor-pointer rounded-lg border bg-surface p-2.5 shadow-sm transition-all hover:border-primary/30 hover:shadow-glow ${
        d?.illusion ? 'border-dashed border-danger/60 bg-danger/[0.02]'
        : project.sourceLeadId && project.milestone > 0 ? 'border-l-[3px] border-l-success'
        : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-xs font-semibold text-text-primary">
          {project.name}
          {d?.illusion && <span className="ml-1 text-[11px] font-medium text-danger">疑似幻觉</span>}
        </p>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{project.company?.name || '无关联客户'}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-sm font-bold text-text-primary">¥{project.amount ?? '-'}</span>
        {hs != null && (
          <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
            hs >= 70 ? 'bg-success/10 text-success' : hs >= 40 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'
          }`}>
            健康 {hs}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {d && d.decisionChainCount > 0 && <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-[11px] text-text-tertiary">决策链 {d.decisionChainCount}人</span>}
        {d && d.evidenceCount > 0 && <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-[11px] text-text-tertiary">证据链 {d.evidenceCount}条</span>}
        {d && d.waiting && project.waitingStatus && (
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            {WAITING_STATUSES[project.waitingStatus as WaitingStatus] || '等待中'}
          </span>
        )}
        {d && !d.waiting && d.staleDays > 0 && (
          <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[11px] font-bold text-danger">停滞 {d.staleDays}天</span>
        )}
      </div>
      {(d?.nextAction || d?.illusion) && (
        <div className="mt-1.5 border-t border-dashed border-border pt-1.5 text-[11px]">
          {d?.illusion ? (
            <p className="text-danger">汇报无物理证据支撑，需实地核实</p>
          ) : (
            <p className="truncate text-text-secondary">
              ▶ 下一步：<b className="text-primary">{d!.nextAction!.title}</b>
              {d!.nextAction!.deadline && <span className="text-text-tertiary">（{new Date(d!.nextAction!.deadline).toLocaleDateString('zh-CN')} 截止）</span>}
            </p>
          )}
        </div>
      )}
      {project.milestone < 8 && !project.closedAt && gateStatus.completed && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdvance(project) }}
          className="mt-1.5 w-full rounded-md bg-primary py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-primary/90"
        >
          推进 →
        </button>
      )}
      {project.milestone < 8 && !project.closedAt && !gateStatus.completed && (
        <div onClick={(e) => e.stopPropagation()}>
          <AiEntryButton
            prompt={`项目「${project.name}」当前在 ${milestoneLabels[project.milestone]} 阶段，推进条件不满足（缺少：${gateStatus.missing.join('、')}），请帮我分析下一步该怎么做`}
            label="问小销：缺推进条件"
            variant="ghost"
            entityType="project"
            entityId={project.id}
          />
        </div>
      )}
      {project.closedAt && !project.lostInfo && (
        <p className="mt-1.5 rounded-md bg-success/10 py-0.5 text-center text-[11px] font-medium text-success">赢单</p>
      )}
    </div>
  )
}

function ProjectBoard({
  projects,
  onSelect,
  onAdvance,
  collapsed = false,
}: {
  projects: Project[]
  onSelect: (project: Project) => void
  onAdvance: (project: Project) => void
  collapsed?: boolean
}) {
  const columns = milestoneLabels.map((label, milestone) => ({
    milestone,
    label,
    items: projects.filter((p) => p.milestone === milestone),
  }))

  // 折叠模式（决策⑧）：三阶段三大列
  if (collapsed) {
    return (
      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        {PHASES.map((phase) => {
          const items = projects.filter((p) => p.milestone >= phase.range[0] && p.milestone <= phase.range[1])
          const amountSum = items.reduce((s, p) => s + Number(p.amount ?? 0), 0)
          return (
            <div key={phase.name} className={`flex flex-col rounded-xl border border-border border-t-2 bg-surface-elevated/50 ${phase.cls}`}>
              <div className="border-b border-border px-3 py-2">
                <p className="text-xs font-bold text-text-primary">{phase.name}</p>
                <p className="mt-0.5 flex justify-between text-[11px] text-text-tertiary">
                  <span>M{phase.range[0]}-M{phase.range[1]} · {items.length} 单</span>
                  <span>¥{amountSum}万</span>
                </p>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {items.map((project) => (
                  <ProjectCard key={project.id} project={project} onSelect={onSelect} onAdvance={onAdvance} />
                ))}
                {items.length === 0 && <p className="py-4 text-center text-[11px] text-text-tertiary">暂无商机</p>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto p-4">
      <div className="flex min-w-[1180px] gap-2.5">
        {columns.map((col) => {
          const phase = phaseOf(col.milestone)
          const amountSum = col.items.reduce((s, p) => s + Number(p.amount ?? 0), 0)
          // 列脚瓶颈提示：单列 ≥3 单堆积（审计 #13：注释与实现对齐）
          const bottleneck = col.items.length >= 3 ? `${milestoneLabels[col.milestone]} 堆积 ${col.items.length} 单，检查本环节是否卡脖子` : ''
          return (
            <div key={col.milestone} className={`flex w-56 flex-col rounded-xl border border-border border-t-2 bg-surface-elevated/50 ${phase.cls}`}>
              <div className="border-b border-border px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <span className={`rounded px-1 py-0.5 text-[11px] font-bold text-white ${phase.label}`}>M{col.milestone}</span>
                  <span className="text-xs font-bold text-text-primary">{col.label}</span>
                </div>
                <p className="mt-0.5 flex justify-between text-[11px] text-text-tertiary">
                  <span>{col.items.length} 单</span>
                  <span>¥{amountSum}万</span>
                </p>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {col.items.map((project) => (
                  <ProjectCard key={project.id} project={project} onSelect={onSelect} onAdvance={onAdvance} />
                ))}
                {col.items.length === 0 && <p className="py-3 text-center text-[11px] text-text-tertiary">—</p>}
              </div>
              {bottleneck && (
                <div className="border-t border-dashed border-border px-2.5 py-1.5 text-[11px] text-danger">{bottleneck}</div>
              )}
            </div>
          )
        })}
      </div>
      {/* 图例 */}
      <div className="mt-2 flex flex-wrap gap-4 px-1 text-[11px] text-text-tertiary">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-primary align-middle" />M0-2 育单·摸清底细</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-violet-600 align-middle" />M3-5 谈单·拿下方案与价</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-success align-middle" />M6-8 成单·走完采购</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-danger/20 align-middle" />红标=停滞/幻觉</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-primary/20 align-middle" />紫/蓝标=合理等待（不计停滞）</span>
      </div>
    </div>
  )
}

/** 漏斗视图（决策⑩：从 pipeline.tsx 并入） */
function ProjectFunnel({ projects }: { projects: Project[] }) {
  const data = milestoneLabels.map((label, milestone) => {
    const items = projects.filter((p) => p.milestone === milestone)
    return {
      name: `M${milestone} ${label}`,
      count: items.length,
      amount: items.reduce((s, p) => s + Number(p.amount ?? 0), 0),
    }
  })
  return (
    <div className="p-6">
      <p className="mb-4 text-sm text-text-secondary">各里程碑在途商机数量与金额分布（名义管线，未经脱水）</p>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e2e8f0)" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={70} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={((value: unknown, name: unknown) => (name === '金额' ? [`${value} 万`, String(name)] : [String(value), String(name)])) as never}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="count" name="商机数" fill="var(--color-primary, #2563eb)" radius={[4, 4, 0, 0]} />
          <Bar yAxisId="right" dataKey="amount" name="金额" fill="#7c3aed" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function DecisionChainSection({ projectId, companyId, companyName }: { projectId: string; companyId?: string; companyName?: string }) {
  const { data, isLoading, error } = useDecisionChain(projectId)
  const update = useUpdateDecisionChain(projectId)

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <p className="text-sm text-danger">决策链加载失败</p>
        <p className="text-xs text-text-tertiary">{(error as Error).message}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <DecisionChainMap
        projectId={projectId}
        map={data?.map || { nodes: [], relations: [] }}
        summary={data?.summary || {
          nodeCount: 0,
          decisionMakerCount: 0,
          coachCount: 0,
          evaluatorCount: 0,
          supportiveCount: 0,
          opposedCount: 0,
          neutralCount: 0,
          coverageScore: 0,
        }}
        onChange={(map) => update.mutate(map)}
        companyId={companyId}
        companyName={companyName}
      />
    </div>
  )
}

function GateFieldPanel({
  project,
  fields,
  gateField,
  onAdvance,
}: {
  project: Project
  fields: Array<{ path: string; label: string; validate?: (val: unknown) => boolean }>
  gateField: ReturnType<typeof useUpdateGateField>
  /** 一步提交（issue #32 验收：字段+推进不再两步）：保存最后缺失字段后复用页面级推进 confirm 流程 */
  onAdvance?: (project: Project) => void | Promise<void>
}) {
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const metas = readFieldMetas(project.evidence)
  const record = project as unknown as Record<string, unknown>
  // 与 checkGateCompletion 同口径：当前还缺几个字段（值维度）
  const missingCount = fields.filter((f) => {
    const v = getNestedValue(record, f.path)
    return f.validate ? !f.validate(v) : isEmptyValue(v)
  }).length

  return (
    <div className="space-y-1">
      {fields.map((field) => {
        const val = getNestedValue(record, field.path)
        const valid = field.validate ? field.validate(val) : !isEmptyValue(val)
        const colloq = FIELD_COLLOQ[field.path]
        const meta = metas[field.path]
        const level = valid ? (meta?.level ?? 'single') : null
        // AI 提取但无 meta 记录（历史数据）按单源展示
        const levelMeta = level ? LEVEL_META[level] : null
        const req = colloq?.req ?? 'material'
        const belowReq = level ? (LEVEL_RANK[level] < REQ_LEVEL[req]) : false
        const locked = level === 'cross' || level === 'final'
        const display = Array.isArray(val)
          ? `${val.length} 项`
          : typeof val === 'string' ? (val.length > 30 ? `${val.slice(0, 30)}…` : val) : '-'
        return (
          <div key={field.path} className="border-t border-border-subtle py-2.5 first:border-t-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-text-secondary" title={field.label}>{colloq?.label ?? field.label}</span>
              {levelMeta ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${levelMeta.cls}`}>{levelMeta.text}</span>
              ) : (
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] font-bold text-text-tertiary">待提交材料</span>
              )}
              {belowReq && level && (
                <span className="text-[10px] text-text-tertiary">未达水位</span>
              )}
              <span className="ml-auto flex items-center gap-1.5">
                {typeof val === 'string' && !locked && (
                  <button
                    onClick={() => { setEditingPath(field.path); setDraft(val) }}
                    className="text-[11px] text-primary hover:underline"
                  >
                    {valid ? '修改' : '填写'}
                  </button>
                )}
                {locked && <span className="text-[11px] text-text-tertiary" title="已达交叉/坐实水位，不可手改（防自述覆盖客观证据）">已锁定</span>}
                {level !== 'final' && (
                  <button
                    onClick={() => gateField.mutate(
                      { path: field.path, manualPass: true, reason: '人工标记达标' } as never,
                    )}
                    className="text-[11px] text-warning hover:underline"
                    title="信息来自公告/调研等非拜访渠道时，标记该字段达标（留痕）"
                  >
                    标记达标
                  </button>
                )}
                {level === 'final' && (
                  <button
                    onClick={() => gateField.mutate({ path: field.path, manualPass: false } as never)}
                    className="text-[11px] text-danger hover:underline"
                  >
                    取消豁免
                  </button>
                )}
              </span>
            </div>
            {/* 验证要求 + 帮助 */}
            <p className="mt-0.5 text-[11px] text-text-tertiary">
              验证要求：<b className="text-info">{REQ_NAME[req]}</b>
              <span className="ml-1">· {colloq?.help ?? field.label} · 手动填写视为自述，材料到达后自动印证或覆盖</span>
            </p>
            {/* 当前值 */}
            <p className={`mt-1 text-xs ${valid ? 'text-text-secondary' : 'text-text-tertiary'}`} title={typeof val === 'string' ? val : undefined}>
              {valid || level === 'final' ? display : '未录入——提交材料由 AI 提取，或点「填写」手填（自述）'}
            </p>

            {editingPath === field.path && (() => {
              // 一步提交：本字段是最后一个缺失字段（保存后 gate 即满足）→ 主按钮「保存并推进」
              const isLastMissing = !valid && missingCount === 1 && project.milestone < 8 && !!onAdvance
              return (
              <div className="mt-2 space-y-1.5">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  aria-label={`${colloq?.label ?? field.label} 人工录入`}
                  placeholder="AI 提取后自动填充；也可手动填写（将标记为自述·未验证）…"
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-primary"
                />
                <div className="flex gap-1.5">
                  <button onClick={() => setEditingPath(null)} className="flex-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary">取消</button>
                  <button
                    onClick={() => gateField.mutate(
                      { path: field.path, value: draft.trim() },
                      {
                        onSuccess: () => {
                          setEditingPath(null)
                          // 保存成功且 gate 即将满足 → 用乐观快照触发页面级推进 confirm（弱锚定警示保留）
                          if (isLastMissing && onAdvance) {
                            onAdvance(withNestedValue(project, field.path, draft.trim()))
                          }
                        },
                      },
                    )}
                    disabled={!draft.trim() || gateField.isPending}
                    title={isLastMissing ? '保存后本阶段条件齐备，将自动发起推进确认' : undefined}
                    className="flex-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {gateField.isPending ? '保存中…' : isLastMissing ? '保存并推进' : '保存（自述）'}
                  </button>
                </div>
              </div>
              )
            })()}

            {/* 来源链（ADR-0005）：chips 可撤销 + 决策人坐实 */}
            {meta && meta.sources.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {meta.sources.map((s) => (
                  <span key={s} className="flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] text-text-secondary">
                    <Paperclip size={9} /> {s}
                    <button
                      onClick={() => gateField.mutate({ path: field.path, revokeSource: s } as never)}
                      className="font-bold text-danger hover:opacity-70"
                      aria-label={`撤销来源 ${s}`}
                      title="撤销该来源（水位降级）"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {level === 'cross' && req === 'decision' && (
                  <button
                    onClick={() => gateField.mutate({ path: field.path, confirmDecision: true } as never)}
                    className="rounded-full border border-success/50 px-2.5 py-0.5 text-[10.5px] text-success transition-colors hover:bg-success/10"
                    title="决策人直接确认后，字段坐实"
                  >
                    决策人确认（坐实）
                  </button>
                )}
                {level !== 'final' && meta.sources.length < 2 && (
                  <button
                    onClick={() => gateField.mutate({ path: field.path, addSource: `材料${new Date().toLocaleDateString('zh-CN')}` } as never)}
                    className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-[10.5px] text-text-tertiary transition-colors hover:border-primary hover:text-primary"
                    title="实际流程：再提交一份材料由 AI 提取；此处手动登记一份来源用于交叉"
                  >
                    + 补一份来源（交叉坐实）
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
