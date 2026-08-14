import { useState, useEffect } from 'react'
import { Plus, Loader2, Pencil, Trash2, ChevronRight, Calendar, Flag, CheckCircle2, AlertTriangle, Building2, Briefcase } from 'lucide-react'
import { useProjects, useProject, useDeleteProject, useUpdateProject, WAITING_STATUSES, type Project, type WaitingStatus } from '../hooks/use-projects.js'
import { useDecisionChain, useUpdateDecisionChain } from '../hooks/use-decision-chain.js'
import { DecisionChainMap } from '../components/projects/decision-chain-map.js'
import WaitingSection from '../components/projects/waiting-section.js'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { entityRouteTo } from '../lib/entity-links.js'
import AiEntryButton from '../components/ai/ai-entry-button.js'
import ProjectForm from '../components/forms/project-form.js'
import VisitForm from '../components/forms/visit-form.js'
import Drawer from '../components/ui/drawer.js'
import VisitDetailDrawer from '../components/visits/visit-detail-drawer.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { useConfirmDialog } from '../hooks/use-confirm-dialog.js'
import { TimelineView } from '../components/timeline/timeline-view.js'

const milestoneLabels = [
  '初识客户', '明确痛点', '明确需求', '明确经费',
  '明确方案', '明确价格', '协助采购', '招标确认', '投标中标',
]

const milestoneColors = [
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
  'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500', 'bg-orange-500', 'bg-emerald-500',
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

// 各里程碑阶段标准动作清单（基于销售方法论）
const milestoneChecklists: Record<number, { title: string; items: string[]; nextHint: string }> = {
  0: {
    title: 'M0 初识客户 — 本阶段标准动作',
    items: [
      '已建立初次联系（电话/拜访/引荐）',
      '已了解客户基本情况（学校规模、院系设置、信息化现状）',
      '已确认客户对AI教育的初步认知',
      '已约定下次沟通时间和主题',
    ],
    nextHint: '推进到 M1 明确痛点的条件：识别出至少1个具体痛点，且客户愿意深入交流',
  },
  1: {
    title: 'M1 明确痛点 — 本阶段标准动作',
    items: [
      '已识别 ≥1 个明确痛点（师资不足/平台卡顿/课程质量等）',
      '痛点已与客户关键人当面确认',
      '已记录痛点证据（客户原话/政策文件/现有问题截图）',
      '已评估各痛点的紧迫度和影响范围',
    ],
    nextHint: '推进到 M2 明确需求的条件：痛点已量化成具体需求指标（覆盖学生数、开课时间、功能要求）',
  },
  2: {
    title: 'M2 明确需求 — 本阶段标准动作',
    items: [
      '需求已量化（覆盖学生规模、开课学期、学分要求）',
      '需求优先级已与客户共识排序',
      '已确认需求范围边界（哪些做/哪些不做）',
      '已获取客户对需求的签字/邮件确认',
    ],
    nextHint: '推进到 M3 明确经费的条件：客户已透露预算来源和大致金额区间',
  },
  3: {
    title: 'M3 明确经费 — 本阶段标准动作',
    items: [
      '已确认预算来源（常规预算/专项经费/科研经费/自筹）',
      '已了解预算金额范围（上限/下限/心理价位）',
      '已明确审批流程（需要哪些人签字、几级审批）',
      '已识别关键审批人及其权力范围',
    ],
    nextHint: '推进到 M4 明确方案的条件：客户认可我方方案方向，同意进入技术交流/演示阶段',
  },
  4: {
    title: 'M4 明确方案 — 本阶段标准动作',
    items: [
      '已呈现针对该客户的定制化方案',
      '已完成技术交流/产品演示/案例参观',
      '已确认实施计划（时间线、交付内容、验收标准）',
      '已获取客户对方案的核心反馈（认可/修改意见）',
    ],
    nextHint: '推进到 M5 明确价格的条件：方案已通过技术评估，客户进入商务谈判阶段',
  },
  5: {
    title: 'M5 明确价格 — 本阶段标准动作',
    items: [
      '已提交正式报价单（含明细和价格构成）',
      '已处理主要价格异议（与竞品对比/ROI论证）',
      '已确认合同核心条款（付款方式、交付周期、售后）',
      '已与客户达成价格共识（书面或邮件确认）',
    ],
    nextHint: '推进到 M6 协助采购的条件：价格已共识，客户开始内部采购流程',
  },
  6: {
    title: 'M6 协助采购 — 本阶段标准动作',
    items: [
      '已协助客户完成采购申请文件',
      '已准备投标所需资质和材料',
      '已确认采购关键时间节点（挂网/开标/评标）',
      '已持续跟进采购进度，排除流程障碍',
    ],
    nextHint: '推进到 M7 招标确认的条件：招标参数已确定，我方技术评分占优',
  },
  7: {
    title: 'M7 招标确认 — 本阶段标准动作',
    items: [
      '已确认招标参数有利于我方（或至少公平）',
      '已中标或评标结果明显倾向我方',
      '已准备合同签署所需全部文件',
      '已明确项目启动时间和首期交付内容',
    ],
    nextHint: '推进到 M8 投标中标的条件：合同已签署，项目正式启动',
  },
  8: {
    title: 'M8 投标中标 — 客户成功阶段',
    items: [
      '合同已正式签署并归档',
      '项目已启动（召开启动会、成立项目组）',
      '交付计划已与客户确认',
      '已制定客户成功/增购计划',
    ],
    nextHint: '本阶段为终点，重点转向交付实施和客户成功，挖掘增购和转介绍机会',
  },
}

// 里程碑推进门控配置（必须与后端保持一致）
const MILESTONE_GATES: Record<number, { requiredFields: Array<{ path: string; label: string; validate?: (val: unknown) => boolean }> }> = {
  0: { requiredFields: [{ path: 'humanInfo.firstContact', label: '首次接触方式' }] },
  1: { requiredFields: [{ path: 'humanInfo.painPoints', label: '痛点列表', validate: (v) => Array.isArray(v) && v.length >= 1 }] },
  2: { requiredFields: [{ path: 'businessInfo.requirements', label: '需求指标' }] },
  3: { requiredFields: [{ path: 'financeInfo.budget', label: '预算金额' }] },
  4: { requiredFields: [{ path: 'businessInfo.solution', label: '方案要点' }] },
  5: { requiredFields: [{ path: 'financeInfo.price', label: '报价金额' }] },
  6: { requiredFields: [{ path: 'decisionMap.nodes', label: '决策链人物', validate: (v) => Array.isArray(v) && v.length >= 1 }] },
  7: { requiredFields: [{ path: 'evidence.bidResult', label: '中标结果' }] },
  8: { requiredFields: [] },
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
    if (!valid) missing.push(field.label)
  }
  return { completed: missing.length === 0, missing }
}

export default function Projects() {
  const [tab, setTab] = useState('全部')
  const [viewMode, setViewMode] = useState<'list' | 'board'>('board')
  const [open, setOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Partial<Project> | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [visitFormOpen, setVisitFormOpen] = useState(false)
  const [visitDetailId, setVisitDetailId] = useState<string | undefined>(undefined)
  const { data, isLoading, error } = useProjects()
  const del = useDeleteProject()
  const update = useUpdateProject()
  const confirmDialog = useConfirmDialog()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

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
    if (!(await confirmDialog.confirm({
      title: '推进里程碑',
      description: `确定将「${project.name}」从「${milestoneLabels[project.milestone]}」推进到「${milestoneLabels[project.milestone + 1]}」吗？`,
      confirmLabel: '推进',
    }))) return
    update.mutate({ id: project.id, data: { milestone: project.milestone + 1 } })
  }

  const handleClose = () => {
    setOpen(false)
    setEditingItem(undefined)
  }

  const filteredItems = data?.items.filter((p) => {
    if (tab === '全部') return true
    if (tab === '跟进中') return !p.closedAt
    if (tab === '已签约') return p.closedAt && !p.lostInfo
    if (tab === '已流失') return p.lostInfo
    return true
  }) || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">商机管理</h2>
        <div className="flex items-center gap-2">
          <AiEntryButton
            prompt="帮我看看当前商机 Pipeline，哪些需要优先推进"
            label="问小销"
            variant="primary"
            className="rounded-xl px-4 py-2 text-sm"
          />
          <button
            onClick={() => { setEditingItem(undefined); setOpen(true) }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus size={16} /> 新建商机
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-6">
            {['全部', '跟进中', '已签约', '已流失'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-sm font-medium ${
                  tab === t ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-elevated p-1">
            <button
              onClick={() => setViewMode('board')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'board'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              看板
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              列表
            </button>
          </div>
        </div>

        {isLoading && <LoadingState />}

        {error && <ErrorState message={(error as Error).message || '加载失败'} />}

        {!isLoading && !error && filteredItems.length === 0 && (
          <EmptyState
            title="暂无商机数据"
            description="AI 将自动分析线索转化潜力"
          />
        )}

        {!isLoading && !error && filteredItems.length > 0 && viewMode === 'board' && (
          <ProjectBoard
            projects={filteredItems}
            onSelect={(p) => setDetailId(p.id)}
            onAdvance={handleAdvanceMilestone}
          />
        )}

        {!isLoading && !error && filteredItems.length > 0 && viewMode === 'list' && (
          <div className="divide-y divide-border">
            {filteredItems.map((project) => (
              <div key={project.id} className="flex items-center justify-between px-6 py-4 hover:bg-surface-elevated/50 transition-colors cursor-pointer" onClick={() => setDetailId(project.id)}>
                <div>
                  <p className="font-medium text-text-primary">{project.name}</p>
                  <p className="text-sm text-text-secondary">
                    {project.company?.name ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (project.company?.id) navigate(entityRouteTo('customer', project.company.id)) }}
                        className="text-primary hover:underline"
                      >
                        {project.company.name}
                      </button>
                    ) : '无关联客户'} · {milestoneLabels[project.milestone] ?? '未知阶段'}
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

      <Drawer open={!!detailId} onClose={handleCloseDetail} title="商机详情" width="720px">
        {detailId && !detailItem && <LoadingState />}
        {detailItem && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-text-primary">{detailItem.name}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                  {detailItem.company?.name && (
                    <button
                      onClick={() => navigate(entityRouteTo('customer', detailItem.company!.id))}
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <Building2 size={12} /> {detailItem.company.name}
                    </button>
                  )}
                  {detailItem.industry && (
                    <span className="flex items-center gap-1">
                      <Briefcase size={12} /> {detailItem.industry}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  onClick={() => setVisitFormOpen(true)}
                  className="flex items-center gap-1 rounded-lg bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-success/90 transition-colors"
                  title="记录拜访"
                >
                  <Plus size={12} /> 记录拜访
                </button>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${urgencyMap[detailItem.urgency]?.color || ''}`}>
                  {urgencyMap[detailItem.urgency]?.label || detailItem.urgency}
                </span>
              </div>
            </div>

            {/* 等待状态（V6.1 §7.2：流程性等待不计停滞） */}
            <WaitingSection projectId={detailItem.id} />

            {/* Key metrics */}
            <div className="grid grid-cols-3 gap-3">
              {detailItem.amount != null && (
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-xs text-text-tertiary">预估金额</p>
                  <p className="mt-1 text-xl font-semibold text-primary">{detailItem.amount} 万</p>
                </div>
              )}
              {detailItem.healthScore != null && (
                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-text-tertiary">健康度</p>
                    <span className={`text-xs font-medium ${
                      detailItem.healthScore >= 60 ? 'text-success' :
                      detailItem.healthScore >= 40 ? 'text-warning' :
                      'text-danger'
                    }`}>{detailItem.healthScore}分</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className={`h-full rounded-full transition-all ${
                        detailItem.healthScore >= 60 ? 'bg-success' :
                        detailItem.healthScore >= 40 ? 'bg-warning' :
                        'bg-danger'
                      }`}
                      style={{ width: `${detailItem.healthScore}%` }}
                    />
                  </div>
                </div>
              )}
              {(detailItem.nextFollowUp || detailItem.lastVisitTime) && (
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-xs text-text-tertiary">{detailItem.nextFollowUp ? '下次跟进' : '上次拜访'}</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {new Date(detailItem.nextFollowUp || detailItem.lastVisitTime || '').toLocaleDateString('zh-CN')}
                  </p>
                </div>
              )}
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-5 gap-5">
              {/* Left: progress + checklist + decision chain */}
              <div className="col-span-3 space-y-5">
                {/* Milestone Timeline */}
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-text-secondary">里程碑进度</h4>
                    {detailItem.milestone < 8 && !detailItem.closedAt && (
                      <button
                        onClick={() => handleAdvanceMilestone(detailItem)}
                        disabled={update.isPending || !checkGateCompletion(detailItem).completed}
                        className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                        title={checkGateCompletion(detailItem).completed ? '' : `需先录入：${checkGateCompletion(detailItem).missing.join('、')}`}
                      >
                        {update.isPending ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                        推进
                      </button>
                    )}
                  </div>
                  <div className="relative mt-4">
                    <div className="absolute left-0 top-[11px] h-0.5 w-full bg-border" />
                    <div className="relative flex justify-between">
                      {milestoneLabels.map((label, i) => (
                        <div key={i} className="flex flex-col items-center gap-1.5" title={label}>
                          <div className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                            i <= detailItem.milestone ? milestoneColors[i] : 'bg-border'
                          }`}>
                            {i < detailItem.milestone ? <CheckCircle2 size={12} /> : (i + 1)}
                          </div>
                          <span className={`text-center text-[10px] leading-tight ${
                            i === detailItem.milestone ? 'font-medium text-primary' : 'text-text-tertiary'
                          }`}>
                            {i === detailItem.milestone ? label : `M${i}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Milestone Stage Checklist */}
                {(() => {
                  const checklist = milestoneChecklists[detailItem.milestone]
                  if (!checklist) return null
                  const gateStatus = checkGateCompletion(detailItem)
                  const gate = MILESTONE_GATES[detailItem.milestone]
                  return (
                    <div className="rounded-xl border border-border bg-background p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-sm font-medium text-text-secondary">{checklist.title}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${gateStatus.completed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                          {gateStatus.completed ? '已满足推进条件' : '未满足推进条件'}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {checklist.items.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border">
                              <div className="h-2.5 w-2.5 rounded-sm bg-surface-elevated" />
                            </div>
                            <span className="text-xs text-text-secondary leading-relaxed">{item}</span>
                          </div>
                        ))}
                      </div>

                      {gate && gate.requiredFields.length > 0 && (
                        <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface p-3">
                          <p className="text-xs font-medium text-text-secondary">阶段推进校验</p>
                          {gate.requiredFields.map((field) => {
                            const val = getNestedValue(detailItem as unknown as Record<string, unknown>, field.path)
                            const valid = field.validate ? field.validate(val) : !isEmptyValue(val)
                            return (
                              <div key={field.path} className="flex items-center justify-between">
                                <span className="text-xs text-text-secondary">{field.label}</span>
                                <span className={`text-[10px] font-medium ${valid ? 'text-success' : 'text-warning'}`}>
                                  {valid ? '已录入' : '未录入'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {!gateStatus.completed && (
                        <div className="mt-3 rounded-lg border border-warning/20 bg-warning/5 p-3">
                          <p className="text-xs text-warning">本阶段信息需通过客户拜访获取，请记录拜访后由 AI 自动分析提取。</p>
                          <button
                            type="button"
                            onClick={() => setVisitFormOpen(true)}
                            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 text-xs font-medium text-white hover:bg-primary/90"
                          >
                            <Plus size={12} /> 记录拜访
                          </button>
                        </div>
                      )}

                      <div className="mt-3 rounded-lg bg-primary/5 p-3">
                        <p className="text-xs font-medium text-primary">{checklist.nextHint}</p>
                      </div>
                    </div>
                  )
                })()}

                {/* Decision Chain */}
                <DecisionChainSection projectId={detailItem.id} companyId={detailItem.company?.id} companyName={detailItem.company?.name} />
              </div>

              {/* Right: timeline + visits + tasks */}
              <div className="col-span-2 space-y-5">
                {/* 时间轴视图（V6.1 Phase 5：类型筛选 + 滚动加载，待确认事件不显示） */}
                <TimelineView entityType="project" entityId={detailItem.id} title="项目时间轴" />

                {/* Related Visits */}
                <div className="rounded-xl border border-border bg-background p-4">
                  <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                    <Calendar size={14} /> 近期拜访
                  </h4>
                  {(!detailItem.visits || detailItem.visits.length === 0) && (
                    <p className="text-xs text-text-tertiary">暂无拜访记录</p>
                  )}
                  <div className="space-y-2">
                    {detailItem.visits?.map((v) => (
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
                          <p className="text-xs text-text-tertiary">{new Date(v.visitTime).toLocaleString('zh-CN')}</p>
                        </div>
                        {v.contactName && (
                          <span className="shrink-0 text-xs text-text-secondary">{v.contactName}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Related Tasks */}
                <div className="rounded-xl border border-border bg-background p-4">
                  <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                    <Flag size={14} /> 关联任务
                  </h4>
                  {(!detailItem.tasks || detailItem.tasks.length === 0) && (
                    <p className="text-xs text-text-tertiary">暂无关联任务</p>
                  )}
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
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${taskStatusMap[t.status]?.color || ''}`}>
                          {taskStatusMap[t.status]?.label || t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
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
          </div>
        )}
      </Drawer>

      <VisitDetailDrawer visitId={visitDetailId} onClose={() => setVisitDetailId(undefined)} />

      <VisitForm
        open={visitFormOpen}
        onClose={(created) => {
          setVisitFormOpen(false)
          // 录完拜访后刷新详情（近期拜访/健康度/下次跟进都会变）
          if (created && detailId) {
            queryClient.invalidateQueries({ queryKey: ['project', detailId] })
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

function ProjectBoard({
  projects,
  onSelect,
  onAdvance,
}: {
  projects: Project[]
  onSelect: (project: Project) => void
  onAdvance: (project: Project) => void
}) {
  const columns = milestoneLabels.map((label, milestone) => ({
    milestone,
    label,
    items: projects.filter((p) => p.milestone === milestone),
    color: milestoneColors[milestone],
  }))

  return (
    <div className="overflow-x-auto p-4">
      <div className="flex min-w-[1024px] gap-3">
        {columns.map((col) => (
          <div key={col.milestone} className="flex w-60 flex-col rounded-xl border border-border bg-surface-elevated/50">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <div className={`h-2 w-2 rounded-full ${col.color}`} />
              <span className="text-xs font-medium text-text-secondary">{col.label}</span>
              <span className="ml-auto rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-text-tertiary">{col.items.length}</span>
            </div>
            <div className="flex-1 space-y-2 p-2">
              {col.items.map((project) => {
                const gateStatus = checkGateCompletion(project)
                return (
                  <div
                    key={project.id}
                    onClick={() => onSelect(project)}
                    className="cursor-pointer rounded-lg border border-border bg-surface p-3 shadow-sm transition-all hover:border-primary/30 hover:shadow-glow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium text-text-primary">{project.name}</p>
                      {project.waitingStatus && (
                        <span className="shrink-0 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                          等待中
                        </span>
                      )}
                      {project.healthScore != null && (
                        <span className={`shrink-0 text-[10px] font-medium ${
                          project.healthScore >= 60 ? 'text-success' :
                          project.healthScore >= 40 ? 'text-warning' :
                          'text-danger'
                        }`}>
                          {project.healthScore}分
                        </span>
                      )}
                    </div>
                    {project.company?.name && (
                      <p className="mt-1 truncate text-xs text-text-tertiary">{project.company.name}</p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        project.urgency === 'CRITICAL' ? 'bg-danger/10 text-danger' :
                        project.urgency === 'HIGH' ? 'bg-warning/10 text-warning' :
                        project.urgency === 'MEDIUM' ? 'bg-primary/10 text-primary' :
                        'bg-success/10 text-success'
                      }`}>
                        {urgencyMap[project.urgency]?.label || project.urgency}
                      </span>
                      {project.milestone < 8 && !project.closedAt && gateStatus.completed && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onAdvance(project) }}
                          className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-primary/90"
                        >
                          推进
                        </button>
                      )}
                      {project.milestone < 8 && !project.closedAt && !gateStatus.completed && (
                        <span onClick={(e) => e.stopPropagation()}>
                          <AiEntryButton
                            prompt={`项目「${project.name}」当前在 ${milestoneLabels[project.milestone]} 阶段，推进条件不满足（缺少：${gateStatus.missing.join('、')}），请帮我分析下一步该怎么做`}
                            label="问小销"
                            variant="primary"
                            entityType="project"
                            entityId={project.id}
                          />
                        </span>
                      )}
                    </div>
                    {!gateStatus.completed && !project.closedAt && (
                      <p className="mt-1.5 truncate text-[10px] text-warning">
                        需：{gateStatus.missing.join('、')}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
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
