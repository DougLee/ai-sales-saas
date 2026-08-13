import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post } from '../lib/api.js'
import { toast } from '../lib/toast.js'

/**
 * V6.1 §5.2：AI 提取产物的待确认收件箱
 * 三态生命周期 pending → confirmed / modified / rejected，
 * 确认后才成为事实（写 confirmed 时间轴事件、落库到对应实体）
 */

export type PendingItemType = 'task' | 'budget_signal' | 'key_request' | 'competitor_mention' | 'decision_chain' | string
/** V6.2：auto = 低风险类型自动生效（可撤销）；revoked = 已撤销 */
export type PendingItemStatus = 'pending' | 'confirmed' | 'modified' | 'rejected' | 'auto' | 'revoked'

/** 后端 list 接口附加的人读上下文（AiPendingItem 无外键，后端批量回查合并） */
export interface PendingItemContext {
  companyId?: string | null
  companyName?: string | null
  projectName?: string | null
  leadId?: string | null
  leadName?: string | null
  visitTime?: string | null
  visitType?: string | null
  rawInputType?: string | null
  contactName?: string | null
}

export interface PendingItem {
  id: string
  tenantId: string
  ownerId: string
  projectId?: string | null
  visitId?: string | null
  itemType: PendingItemType
  itemData: Record<string, unknown>
  status: PendingItemStatus
  resolvedData?: Record<string, unknown> | null
  resolvedBy?: string | null
  resolvedAt?: string | null
  createdAt: string
  context?: PendingItemContext | null
}

export const ITEM_TYPE_LABELS: Record<string, string> = {
  task: '跟进任务',
  budget_signal: '预算信号',
  key_request: '客户诉求',
  competitor_mention: '竞品动态',
  decision_chain: '决策链',
}

/** 记录方式（Visit.rawInputType）人读标签 */
export const RAW_INPUT_TYPE_LABELS: Record<string, string> = {
  transcript: '现场录音',
  recap: '个人复盘',
  meeting: '线上会议',
  note: '速记',
}

export function usePendingItems(opts?: { visitId?: string; status?: string }) {
  const params = new URLSearchParams()
  if (opts?.visitId) params.set('visitId', opts.visitId)
  if (opts?.status) params.set('status', opts.status)
  const qs = params.toString()
  return useQuery({
    queryKey: ['confirmations', opts],
    queryFn: () => get<PendingItem[]>(`/api/confirmations${qs ? `?${qs}` : ''}`),
    refetchInterval: 30_000,
  })
}

export function useResolveItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      action,
      modifiedData,
    }: {
      id: string
      action: 'confirm' | 'modify' | 'reject' | 'revoke'
      modifiedData?: Record<string, unknown>
    }) => post<PendingItem>(`/api/confirmations/${id}/resolve`, { action, modifiedData }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['confirmations'] })
      qc.invalidateQueries({ queryKey: ['visits'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['visit-closure'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      const msg =
        vars.action === 'confirm'
          ? '已确认'
          : vars.action === 'modify'
            ? '已微调并确认'
            : vars.action === 'revoke'
              ? '已撤销，该内容已从档案中移除'
              : '已驳回'
      toast.success(msg)
    },
    onError: (err) => toast.error((err as Error).message || '操作失败'),
  })
}

export function useBatchConfirm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemIds: string[]) =>
      post<{ confirmed: number }>('/api/confirmations/batch-confirm', { itemIds }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['confirmations'] })
      qc.invalidateQueries({ queryKey: ['visits'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['visit-closure'] })
      toast.success(`已批量确认 ${data.confirmed} 项`)
    },
    onError: (err) => toast.error((err as Error).message || '批量确认失败'),
  })
}

/**
 * 按实体维度聚合成"确认单"：项目 > 线索 > 客户 > 其他。
 * 同一项目的多次拜访合并为一单，表单化逐区确认。
 */
export interface EntityGroup {
  key: string
  kind: 'project' | 'lead' | 'company' | 'other'
  /** 单标题：客户 · 项目 / 客户 · 线索：xxx */
  title: string
  /** 副标题：涉及 N 次拜访 · 最近 M月d日 */
  subtitle: string
  items: PendingItem[]
}

const KIND_LABELS: Record<EntityGroup['kind'], string> = {
  project: '项目',
  lead: '线索',
  company: '客户',
  other: '其他',
}

export function entityKindLabel(kind: EntityGroup['kind']): string {
  return KIND_LABELS[kind]
}

export function groupByEntity(items: PendingItem[]): EntityGroup[] {
  const map = new Map<string, PendingItem[]>()
  const kindOf = new Map<string, EntityGroup['kind']>()
  for (const item of items) {
    const ctx = item.context
    const key = item.projectId
      ? `project:${item.projectId}`
      : ctx?.leadId
        ? `lead:${ctx.leadId}`
        : ctx?.companyId
          ? `company:${ctx.companyId}`
          : 'other'
    kindOf.set(key, key.startsWith('project:') ? 'project' : key.startsWith('lead:') ? 'lead' : key.startsWith('company:') ? 'company' : 'other')
    const list = map.get(key) || []
    list.push(item)
    map.set(key, list)
  }

  return [...map.entries()]
    .map(([key, groupItems]) => {
      const kind = kindOf.get(key) || 'other'
      const ctx = groupItems.find((i) => i.context)?.context
      const title =
        kind === 'other'
          ? '其他来源'
          : [
              ctx?.companyName,
              kind === 'project'
                ? ctx?.projectName || '未命名项目'
                : kind === 'lead'
                  ? `线索：${ctx?.leadName || '未命名线索'}`
                  : null,
            ]
              .filter(Boolean)
              .join(' · ') || KIND_LABELS[kind]

      const visitIds = new Set(groupItems.map((i) => i.visitId).filter(Boolean))
      const latestVisit = groupItems
        .map((i) => i.context?.visitTime)
        .filter((v): v is string => !!v)
        .sort()
        .pop()
      const subtitleParts: string[] = []
      if (visitIds.size > 0) subtitleParts.push(`涉及 ${visitIds.size} 次拜访`)
      if (latestVisit) {
        subtitleParts.push(
          `最近 ${new Date(latestVisit).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`,
        )
      }
      return { key, kind, title, subtitle: subtitleParts.join(' · '), items: groupItems }
    })
    .sort((a, b) => (b.items[0]?.createdAt || '').localeCompare(a.items[0]?.createdAt || ''))
}

const PRIORITY_LABELS: Record<string, string> = { HIGH: '高', MEDIUM: '中', LOW: '低' }

function formatDate(v: unknown): string | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('zh-CN')
}

/** 取条目的主要内容字段（写入端实际结构：task 用 title，其余多为 content） */
function mainContent(item: PendingItem): string {
  const d = item.itemData || {}
  if (item.itemType === 'task') return String(d.title || d.content || '')
  return String(d.content || d.title || '')
}

/**
 * 人读化描述：一句话说清"这是什么"，附加结构化字段与"确认后会发生什么"。
 * 写入端实际结构（visits.analysis.controller）：
 * - task: { title, description, priority, deadline }
 * - budget_signal / key_request / competitor_mention: { content }
 * - decision_chain: { chain: [{ name, role, attitude }] }
 */
export interface ItemDescription {
  /** 主标题：这条信息是什么 */
  headline: string
  /** 结构化字段（标签 + 值），分行展示 */
  fields: Array<{ label: string; value: string }>
  /** 确认后的后果说明 */
  consequence: string
  /** 是否支持微调（decision_chain 为结构化名单，不支持文本微调） */
  modifiable: boolean
  /** 微调时写回 itemData 的字段名（与写入端结构一致） */
  modifyKey: string | null
}

export function describeItem(item: PendingItem): ItemDescription {
  const d = item.itemData || {}
  const content = mainContent(item)

  switch (item.itemType) {
    case 'task': {
      const fields: Array<{ label: string; value: string }> = []
      const deadline = formatDate(d.deadline)
      if (deadline) fields.push({ label: '截止', value: deadline })
      if (d.priority) fields.push({ label: '优先级', value: PRIORITY_LABELS[String(d.priority)] || String(d.priority) })
      return {
        headline: content || '（未命名任务）',
        fields,
        consequence: '确认后创建为跟进任务，出现在你的任务列表',
        modifiable: true,
        modifyKey: 'title',
      }
    }
    case 'budget_signal':
      return {
        headline: content || '（空）',
        fields: [],
        consequence: '确认后写入项目的预算信息（项目预算为空时生效）',
        modifiable: true,
        modifyKey: 'content',
      }
    case 'key_request':
      return {
        headline: content || '（空）',
        fields: [],
        consequence: '确认后追加到项目的客户痛点列表',
        modifiable: true,
        modifyKey: 'content',
      }
    case 'competitor_mention':
      return {
        headline: content || '（空）',
        fields: [],
        consequence: '确认后追加到项目的竞品列表',
        modifiable: true,
        modifyKey: 'content',
      }
    case 'decision_chain': {
      const chain = Array.isArray(d.chain) ? (d.chain as Array<Record<string, unknown>>) : []
      const fields = chain.map((c) => ({
        label: String(c.role || '角色未知'),
        value: [
          `${String(c.name || '未知')}${c.attitude ? `（态度：${String(c.attitude)}）` : ''}`,
          c.insight ? String(c.insight) : null,
        ]
          .filter(Boolean)
          .join(' — '),
      }))
      return {
        headline: chain.length ? `识别到 ${chain.length} 位决策相关人` : content || '决策链信息',
        fields,
        consequence: '确认后写入项目决策地图（项目尚无决策地图时生效）',
        modifiable: false,
        modifyKey: null,
      }
    }
    default:
      return {
        headline: content || JSON.stringify(d),
        fields: [],
        consequence: '确认后归档到时间轴',
        modifiable: true,
        modifyKey: 'content',
      }
  }
}

/**
 * 把一次拜访的待确认项拼成一段连贯的话（摘要级确认的判断单位）。
 * 只覆盖需人工把关的三类（任务/预算/决策链）；auto 类型不在摘要里。
 */
export function buildVisitDigest(items: PendingItem[]): string {
  const parts: string[] = []

  const tasks = items.filter((i) => i.itemType === 'task')
  if (tasks.length) {
    const list = tasks.map((t) => {
      const d = t.itemData || {}
      const deadline = d.deadline ? new Date(String(d.deadline)) : null
      const dl = deadline && !Number.isNaN(deadline.getTime()) ? `（截止 ${deadline.toLocaleDateString('zh-CN')}）` : ''
      return `${String(d.title || '')}${dl}`
    })
    parts.push(`接下来要做：${list.join('；')}`)
  }

  const budget = items.find((i) => i.itemType === 'budget_signal')
  if (budget) parts.push(`客户透露预算：${String(budget.itemData?.content || '')}`)

  const chainItem = items.find((i) => i.itemType === 'decision_chain')
  const chain = Array.isArray(chainItem?.itemData?.chain)
    ? (chainItem!.itemData.chain as Array<Record<string, unknown>>)
    : []
  if (chain.length) {
    const people = chain.map((c) => `${String(c.name || '未知')}（${String(c.role || '角色未知')}）`)
    parts.push(`决策相关人：${people.join('、')}`)
  }

  return parts.join('。') + (parts.length ? '。' : '')
}

/** 实体组内再按拜访分块（摘要级确认的展示单元），按拜访时间倒序 */
export interface VisitBlock {
  visitId: string | null
  items: PendingItem[]
  digest: string
  subtitle: string
}

export function groupVisitBlocks(items: PendingItem[]): VisitBlock[] {
  const map = new Map<string | null, PendingItem[]>()
  for (const item of items) {
    const key = item.visitId || null
    const list = map.get(key) || []
    list.push(item)
    map.set(key, list)
  }
  return [...map.entries()]
    .map(([visitId, blockItems]) => {
      const ctx = blockItems[0]?.context
      const subtitleParts: string[] = []
      if (ctx?.visitTime) {
        subtitleParts.push(
          new Date(ctx.visitTime).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        )
      }
      if (ctx?.rawInputType) subtitleParts.push(RAW_INPUT_TYPE_LABELS[ctx.rawInputType] || ctx.rawInputType)
      if (ctx?.contactName) subtitleParts.push(`拜访对象：${ctx.contactName}`)
      return {
        visitId,
        items: blockItems,
        digest: buildVisitDigest(blockItems),
        subtitle: subtitleParts.join(' · '),
      }
    })
    .sort((a, b) => (b.items[0]?.context?.visitTime || b.items[0]?.createdAt || '').localeCompare(
      a.items[0]?.context?.visitTime || a.items[0]?.createdAt || '',
    ))
}

/** 兼容旧引用：人读摘要 = describeItem 的主标题 */
export function summarizeItem(item: PendingItem): string {
  return describeItem(item).headline
}

/** 勾选清单行：一目了然的"内容 + 元信息"（表单式确认的行模型） */
export interface ChecklistRow {
  text: string
  meta?: string
}

export function buildChecklistRow(item: PendingItem): ChecklistRow {
  const d = item.itemData || {}
  switch (item.itemType) {
    case 'task': {
      const deadline = d.deadline ? new Date(String(d.deadline)) : null
      const parts: string[] = []
      if (deadline && !Number.isNaN(deadline.getTime())) parts.push(`截止 ${deadline.toLocaleDateString('zh-CN')}`)
      if (d.priority) parts.push(`优先级${PRIORITY_LABELS[String(d.priority)] || String(d.priority)}`)
      return { text: String(d.title || ''), meta: parts.join(' · ') || undefined }
    }
    case 'decision_chain': {
      const chain = Array.isArray(d.chain) ? (d.chain as Array<Record<string, unknown>>) : []
      return {
        text: chain.map((c) => `${String(c.name || '未知')}（${String(c.role || '角色未知')}）`).join('、') || '决策链信息',
        meta: `${chain.length} 人`,
      }
    }
    default:
      return { text: String(d.content || d.title || '') }
  }
}

/**
 * 引导式审核文案：把每个待确认项变成"一句话 + 一道判断题"。
 * statement 说清 AI 从拜访里提取到了什么，question 告诉你要判断什么，
 * targetLabel 说明确认后写到哪里。
 */
export interface ReviewPrompt {
  statement: string
  question: string
  targetLabel: string
}

export function buildReviewPrompt(item: PendingItem): ReviewPrompt {
  const d = item.itemData || {}
  const content = String(d.content || d.title || '')
  switch (item.itemType) {
    case 'task': {
      const deadline = d.deadline ? new Date(String(d.deadline)) : null
      const deadlineText = deadline && !Number.isNaN(deadline.getTime())
        ? `，截止 ${deadline.toLocaleDateString('zh-CN')}`
        : ''
      return {
        statement: `需要跟进：${String(d.title || '')}${deadlineText}`,
        question: '要加入你的任务清单吗？',
        targetLabel: '任务列表',
      }
    }
    case 'budget_signal':
      return {
        statement: `客户透露了预算信息：${content}`,
        question: '属实吗？属实将记入项目预算',
        targetLabel: '项目档案 · 预算金额',
      }
    case 'key_request':
      return {
        statement: `客户提出了诉求：${content}`,
        question: '确认这是客户的真实诉求吗？',
        targetLabel: '项目档案 · 痛点列表',
      }
    case 'competitor_mention':
      return {
        statement: `客户提到了竞品：${content}`,
        question: '客户确实提到了吗？',
        targetLabel: '项目档案 · 竞品列表',
      }
    case 'decision_chain': {
      const chain = Array.isArray(d.chain) ? (d.chain as Array<Record<string, unknown>>) : []
      const names = chain.map((c) => String(c.name || '未知')).join('、')
      return {
        statement: `识别到 ${chain.length} 位决策相关人：${names}`,
        question: '人员和角色属实吗？属实将写入决策地图',
        targetLabel: '项目档案 · 决策地图',
      }
    }
    default:
      return {
        statement: content || JSON.stringify(d),
        question: '确认无误吗？',
        targetLabel: '时间轴归档',
      }
  }
}

/**
 * 确认单表单元模型：与手工录入表单同一套字段口径。
 * 每个待确认项 = 一张预填表单，字段名/写入位置与手工入口一致：
 * - task               → 任务列表（任务标题/优先级/截止日期）
 * - budget_signal      → 项目档案 · 财务信息 · 预算金额（financeInfo.budget）
 * - key_request        → 项目档案 · 人文信息 · 痛点列表（humanInfo.painPoints）
 * - competitor_mention → 项目档案 · 商务信息 · 竞品（businessInfo.competitors）
 * - decision_chain     → 项目档案 · 决策地图（decisionMap.nodes，结构化名单只读）
 */
export interface PendingFormField {
  /** itemData 里的字段名（微调写回用） */
  key: string
  /** 字段标签（与手工表单一致） */
  label: string
  inputType: 'text' | 'datetime' | 'priority'
  value: string
}

export interface PendingFormSpec {
  /** 写入位置说明，如「任务列表」「项目档案 · 财务信息 · 预算金额」 */
  targetLabel: string
  fields: PendingFormField[]
  /** true = 结构化内容（决策链名单），不可文本编辑 */
  readonly: boolean
  /** decision_chain 的人员名单行 */
  tableRows?: Array<{ name: string; role: string; attitude: string; insight: string }>
}

function toDatetimeLocal(v: unknown): string {
  if (!v) return ''
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) return ''
  // datetime-local 需要本地时区的 YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function buildFormSpec(item: PendingItem): PendingFormSpec {
  const d = item.itemData || {}
  switch (item.itemType) {
    case 'task':
      return {
        targetLabel: '任务列表',
        readonly: false,
        fields: [
          { key: 'title', label: '任务标题', inputType: 'text', value: String(d.title || '') },
          { key: 'priority', label: '优先级', inputType: 'priority', value: String(d.priority || 'MEDIUM') },
          { key: 'deadline', label: '截止日期', inputType: 'datetime', value: toDatetimeLocal(d.deadline) },
        ],
      }
    case 'budget_signal':
      return {
        targetLabel: '项目档案 · 财务信息 · 预算金额',
        readonly: false,
        fields: [{ key: 'content', label: '预算金额', inputType: 'text', value: String(d.content || '') }],
      }
    case 'key_request':
      return {
        targetLabel: '项目档案 · 人文信息 · 痛点列表',
        readonly: false,
        fields: [{ key: 'content', label: '痛点', inputType: 'text', value: String(d.content || '') }],
      }
    case 'competitor_mention':
      return {
        targetLabel: '项目档案 · 商务信息 · 竞品',
        readonly: false,
        fields: [{ key: 'content', label: '竞品', inputType: 'text', value: String(d.content || '') }],
      }
    case 'decision_chain': {
      const chain = Array.isArray(d.chain) ? (d.chain as Array<Record<string, unknown>>) : []
      return {
        targetLabel: '项目档案 · 决策地图',
        readonly: true,
        fields: [],
        tableRows: chain.map((c) => ({
          name: String(c.name || '未知'),
          role: String(c.role || '-'),
          attitude: String(c.attitude || '-'),
          insight: String(c.insight || ''),
        })),
      }
    }
    default:
      return {
        targetLabel: '时间轴归档',
        readonly: false,
        fields: [{ key: 'content', label: '内容', inputType: 'text', value: String(d.content || d.title || JSON.stringify(d)) }],
      }
  }
}

/** 提取 evidence 锚定原文（治理规范 §四：证据必须来自销售原始输入） */
export function extractEvidence(item: PendingItem): string | null {
  const d = item.itemData || {}
  const ev = d.evidence
  return typeof ev === 'string' && ev.trim() ? ev : null
}
