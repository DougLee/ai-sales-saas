import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Phone, Loader2, ArrowRight } from 'lucide-react'
import type { DecisionMap, DecisionNode, DecisionRelation, DecisionChainSummary } from '../../hooks/use-decision-chain.js'
import { useContacts, useCreateContact, useUpdateContact } from '../../hooks/use-contacts.js'
import Modal from '../ui/modal.js'

/**
 * 决策链关系地图（V6.2 重构）
 *
 * 布局：统计 chips → 全宽地图 → 全宽人物行式列表 → 关系线行式列表。
 * 添加/编辑人物统一走 Modal（从联系人选择或直接填写），不再挤窄栏内联编辑。
 * 色板迁回设计令牌（容器层），角色/态度保留语义色点与徽章。
 */

interface DecisionChainMapProps {
  projectId: string
  map: DecisionMap
  summary: DecisionChainSummary
  readOnly?: boolean
  onChange?: (map: DecisionMap) => void
  companyId?: string
  companyName?: string
}

const ROLE_COLORS: Record<string, string> = {
  DECISION_MAKER: 'bg-red-500',
  COACH: 'bg-blue-500',
  EVALUATOR: 'bg-amber-500',
  USER: 'bg-green-500',
  INFLUENCER: 'bg-purple-500',
  GATEKEEPER: 'bg-slate-500',
  OTHER: 'bg-gray-400',
}

const ROLE_LABELS: Record<string, string> = {
  DECISION_MAKER: '决策者',
  COACH: '引路人',
  EVALUATOR: '评估者',
  USER: '使用人',
  INFLUENCER: '影响者',
  GATEKEEPER: '把关者',
  OTHER: '其他',
}

const ATTITUDE_LABELS: Record<string, string> = {
  supportive: '支持',
  neutral: '中立',
  opposed: '反对',
  unknown: '未知',
}

const ATTITUDE_BADGE: Record<string, string> = {
  supportive: 'bg-success/10 text-success',
  neutral: 'bg-text-tertiary/10 text-text-secondary',
  opposed: 'bg-danger/10 text-danger',
  unknown: 'bg-text-tertiary/10 text-text-tertiary',
}

// 决策链关系类型（与后端 DecisionRelationTypeSchema 保持一致）
const RELATION_TYPES: Array<{ key: string; label: string; color: string }> = [
  { key: 'reports_to', label: '汇报给', color: '#6366f1' },
  { key: 'influences', label: '影响', color: '#f59e0b' },
  { key: 'collaborates', label: '协作', color: '#10b981' },
  { key: 'opposes', label: '对立', color: '#ef4444' },
  { key: 'unknown', label: '未知', color: '#94a3b8' },
]

const RELATION_LABELS: Record<string, string> = Object.fromEntries(
  RELATION_TYPES.map((r) => [r.key, r.label]),
)

function relationColor(relation: string): string {
  return RELATION_TYPES.find((r) => r.key === relation)?.color || '#94a3b8'
}

function getNodeColor(node: DecisionNode) {
  return ROLE_COLORS[node.role] || ROLE_COLORS.OTHER
}

function layoutNodes(nodes: DecisionNode[], width: number, height: number): Array<DecisionNode & { x: number; y: number }> {
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.min(width, height) * 0.35
  const angleStep = nodes.length > 0 ? (2 * Math.PI) / nodes.length : 0

  return nodes.map((node, idx) => {
    const angle = idx * angleStep - Math.PI / 2
    return {
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    }
  })
}

function emptyNode(): DecisionNode {
  return {
    id: `node_${Date.now()}`,
    name: '',
    role: 'OTHER',
    attitude: 'unknown',
  }
}

function nodeFromContact(contact: {
  id: string
  name: string
  position?: string
  department?: string
  phone?: string
  email?: string
}): DecisionNode {
  return {
    id: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    contactId: contact.id,
    name: contact.name,
    title: contact.position,
    department: contact.department,
    role: 'OTHER',
    attitude: 'unknown',
    contactInfo: {
      phone: contact.phone || undefined,
      email: contact.email || undefined,
    },
  }
}

const INPUT_CLS =
  'h-9 w-full rounded-xl border border-border bg-background px-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary disabled:opacity-60'

const SELECT_CLS =
  'h-9 rounded-xl border border-border bg-background px-2 text-sm text-text-primary outline-none focus:border-primary'

export function DecisionChainMap({ map, summary, readOnly, onChange, companyId, companyName }: DecisionChainMapProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [draftNode, setDraftNode] = useState<DecisionNode | null>(null)
  const [isAdd, setIsAdd] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [addingRelation, setAddingRelation] = useState(false)
  const [relationDraft, setRelationDraft] = useState<DecisionRelation>({ sourceId: '', targetId: '', relation: 'reports_to' })
  const [relationError, setRelationError] = useState<string | null>(null)

  const { data: contactsData } = useContacts(companyName ? { company: companyName } : undefined)
  const createContact = useCreateContact()
  const updateContact = useUpdateContact()
  const availableContacts = contactsData?.items || []

  // 过滤掉已经在决策链中的联系人
  const existingContactIds = new Set((map.nodes || []).map((n) => n.contactId).filter(Boolean))
  const selectableContacts = availableContacts.filter((c) => !existingContactIds.has(c.id))

  const nodesWithPos = useMemo(() => layoutNodes(map.nodes || [], 480, 360), [map.nodes])
  const nodes = map.nodes || []

  const relations: Array<DecisionRelation & { sourceX: number; sourceY: number; targetX: number; targetY: number }> =
    useMemo(() => {
      const relationList: DecisionRelation[] = map.relations || []
      return relationList
        .map((r: DecisionRelation) => {
          const source = nodesWithPos.find((n) => n.id === r.sourceId)
          const target = nodesWithPos.find((n) => n.id === r.targetId)
          if (!source || !target) return null
          return {
            ...r,
            sourceX: source.x,
            sourceY: source.y,
            targetX: target.x,
            targetY: target.y,
          }
        })
        .filter((r): r is DecisionRelation & { sourceX: number; sourceY: number; targetX: number; targetY: number } => r != null)
    }, [map.relations, nodesWithPos])

  const openAdd = () => {
    setDraftNode(emptyNode())
    setIsAdd(true)
    setSaveError(null)
    setModalOpen(true)
  }

  const openEdit = (node: DecisionNode) => {
    setDraftNode({ ...node })
    setIsAdd(false)
    setSaveError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setDraftNode(null)
    setSaveError(null)
  }

  /** 从已有联系人选择 → 预填表单；选回空项 → 解除绑定，恢复手动填写 */
  const handlePickContact = (contactId: string) => {
    if (!draftNode) return
    if (!contactId) {
      // 反悔路径：清掉 contactId，字段解锁（保留已选的角色/态度）
      setDraftNode({ ...emptyNode(), role: draftNode.role, attitude: draftNode.attitude })
      return
    }
    const contact = availableContacts.find((c) => c.id === contactId)
    if (!contact) return
    setDraftNode({ ...nodeFromContact(contact), role: draftNode.role, attitude: draftNode.attitude })
  }

  const handleSave = async () => {
    if (!draftNode) return
    const name = draftNode.name.trim()
    if (!name) {
      setSaveError('姓名不能为空')
      return
    }

    let nodeToSave = { ...draftNode, name }

    // 新建联系人（没有 contactId）→ 先创建 Contact
    if (!nodeToSave.contactId) {
      try {
        const created = await createContact.mutateAsync({
          name: nodeToSave.name,
          position: nodeToSave.title,
          department: nodeToSave.department,
          phone: nodeToSave.contactInfo?.phone,
          email: nodeToSave.contactInfo?.email,
          companyId,
        })
        nodeToSave = { ...nodeToSave, contactId: created.item.id }
      } catch {
        setSaveError('创建联系人失败，请重试')
        return
      }
    } else {
      // 已选联系人：表单里补录/修改的职位、部门、电话回写联系人档案（fail-soft 不阻塞保存）
      const profile = availableContacts.find((c) => c.id === nodeToSave.contactId)
      if (profile) {
        const patch: Record<string, string> = {}
        if ((nodeToSave.title || '') !== (profile.position || '')) patch.position = nodeToSave.title || ''
        if ((nodeToSave.department || '') !== (profile.department || '')) patch.department = nodeToSave.department || ''
        if ((nodeToSave.contactInfo?.phone || '') !== (profile.phone || '')) patch.phone = nodeToSave.contactInfo?.phone || ''
        if (Object.keys(patch).length > 0) {
          updateContact.mutate({ id: profile.id, data: patch })
        }
      }
    }

    if (isAdd) {
      onChange?.({ ...map, nodes: [...nodes, nodeToSave] })
    } else {
      onChange?.({ ...map, nodes: nodes.map((n) => (n.id === nodeToSave.id ? nodeToSave : n)) })
    }
    closeModal()
  }

  const handleDelete = (id: string) => {
    const nextNodes = nodes.filter((n) => n.id !== id)
    const nextRelations = (map.relations || []).filter((r) => r.sourceId !== id && r.targetId !== id)
    onChange?.({ ...map, nodes: nextNodes, relations: nextRelations })
  }

  const updateDraft = (patch: Partial<DecisionNode>) => {
    if (!draftNode) return
    setDraftNode({ ...draftNode, ...patch })
  }

  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name || '未命名'

  const handleStartAddRelation = () => {
    if (nodes.length < 2) return
    setRelationDraft({ sourceId: nodes[0].id, targetId: nodes[1].id, relation: 'reports_to' })
    setRelationError(null)
    setAddingRelation(true)
  }

  const handleSaveRelation = () => {
    const { sourceId, targetId, relation } = relationDraft
    if (!sourceId || !targetId) {
      setRelationError('请选择两端人物')
      return
    }
    if (sourceId === targetId) {
      setRelationError('不能选择同一个人')
      return
    }
    const exists = (map.relations || []).some(
      (r) => r.sourceId === sourceId && r.targetId === targetId && r.relation === relation,
    )
    if (exists) {
      setRelationError('该关系已存在')
      return
    }
    onChange?.({ ...map, relations: [...(map.relations || []), { sourceId, targetId, relation }] })
    setAddingRelation(false)
    setRelationError(null)
  }

  const handleDeleteRelation = (index: number) => {
    onChange?.({ ...map, relations: (map.relations || []).filter((_, i) => i !== index) })
  }

  const saving = createContact.isPending

  return (
    <div className="space-y-4">
      {/* 统计 chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          覆盖度 {summary.coverageScore}
        </span>
        <span className="rounded-full bg-surface-elevated px-3 py-1 text-xs text-text-secondary">
          人物 {summary.nodeCount} · 决策者 {summary.decisionMakerCount} · 引路人 {summary.coachCount} · 评估者 {summary.evaluatorCount}
        </span>
        <span className="rounded-full bg-success/10 px-3 py-1 text-xs text-success">支持 {summary.supportiveCount}</span>
        <span className="rounded-full bg-danger/10 px-3 py-1 text-xs text-danger">反对 {summary.opposedCount}</span>
        <span className="rounded-full bg-surface-elevated px-3 py-1 text-xs text-text-tertiary">中立 {summary.neutralCount}</span>
      </div>

      {/* 关系地图（全宽） */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">关系地图</h3>
          {!readOnly && (
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
            >
              <Plus size={14} />
              添加人物
            </button>
          )}
        </div>
        <div className="relative h-[320px] w-full overflow-hidden rounded-lg bg-surface-elevated">
          <svg viewBox="0 0 480 360" className="h-full w-full">
            <defs>
              {RELATION_TYPES.map((rt) => (
                <marker
                  key={rt.key}
                  id={`arrow-${rt.key}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={rt.color} />
                </marker>
              ))}
            </defs>
            <circle cx="240" cy="180" r="28" className="fill-primary/10 stroke-primary" strokeWidth="2" />
            <text x="240" y="185" textAnchor="middle" className="fill-primary text-[10px]">
              我方
            </text>

            {nodesWithPos.map((n) => (
              <line
                key={`center-${n.id}`}
                x1={240}
                y1={180}
                x2={n.x}
                y2={n.y}
                className="stroke-border"
                strokeWidth="1"
              />
            ))}

            {relations.map((r, idx) => {
              const color = relationColor(r.relation)
              const midX = (r.sourceX + r.targetX) / 2
              const midY = (r.sourceY + r.targetY) / 2
              return (
                <g key={idx}>
                  <line
                    x1={r.sourceX}
                    y1={r.sourceY}
                    x2={r.targetX}
                    y2={r.targetY}
                    stroke={color}
                    strokeWidth="1.5"
                    markerEnd={`url(#arrow-${RELATION_TYPES.find((t) => t.key === r.relation)?.key || 'unknown'})`}
                  />
                  <text x={midX} y={midY - 3} textAnchor="middle" fontSize="9" fill={color}>
                    {RELATION_LABELS[r.relation] || r.relation}
                  </text>
                </g>
              )
            })}

            {nodesWithPos.map((n) => (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r="22" className={`${getNodeColor(n)} opacity-90`} />
                <text x={n.x} y={n.y + 4} textAnchor="middle" className="fill-white text-[10px] font-medium">
                  {n.name.slice(0, 3)}
                </text>
              </g>
            ))}
          </svg>

          {nodesWithPos.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-text-tertiary">
              <p>暂无决策链人物</p>
              {!readOnly && <p className="text-xs">点击右上角「添加人物」，或录拜访后由 AI 自动提取</p>}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-text-tertiary">
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${ROLE_COLORS[key]}`} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* 人物列表（全宽行式） */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-medium text-text-primary">人物（{nodes.length}）</h3>
        {nodes.length === 0 && <p className="text-sm text-text-tertiary">暂无人物</p>}
        <ul className="divide-y divide-border/50">
          {nodes.map((node) => (
            <li key={node.id} className="flex items-center gap-3 py-2.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${getNodeColor(node)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{node.name || '未命名'}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    {ROLE_LABELS[node.role] || node.role}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${ATTITUDE_BADGE[node.attitude] || ATTITUDE_BADGE.unknown}`}>
                    {ATTITUDE_LABELS[node.attitude] || '未知'}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
                  {[node.title, node.department].filter(Boolean).join(' · ') || '—'}
                  {node.contactInfo?.phone && (
                    <span className="flex items-center gap-0.5">
                      <Phone size={10} />
                      {node.contactInfo.phone}
                    </span>
                  )}
                </p>
              </div>
              {!readOnly && (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(node)}
                    title="编辑"
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-elevated hover:text-primary"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(node.id)}
                    title="移除"
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-elevated hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* 关系线 */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">关系线（{(map.relations || []).length}）</h3>
          {!readOnly && !addingRelation && (
            <button
              type="button"
              onClick={handleStartAddRelation}
              disabled={nodes.length < 2}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              title={nodes.length < 2 ? '至少需要 2 位人物' : ''}
            >
              <Plus size={14} />
              添加关系
            </button>
          )}
        </div>

        {addingRelation && (
          <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={relationDraft.sourceId}
                onChange={(e) => setRelationDraft({ ...relationDraft, sourceId: e.target.value })}
                className={SELECT_CLS}
              >
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name || '未命名'}</option>
                ))}
              </select>
              <select
                value={relationDraft.relation}
                onChange={(e) => setRelationDraft({ ...relationDraft, relation: e.target.value })}
                className={SELECT_CLS}
              >
                {RELATION_TYPES.map((rt) => (
                  <option key={rt.key} value={rt.key}>{rt.label}</option>
                ))}
              </select>
              <ArrowRight size={14} className="text-text-tertiary" />
              <select
                value={relationDraft.targetId}
                onChange={(e) => setRelationDraft({ ...relationDraft, targetId: e.target.value })}
                className={SELECT_CLS}
              >
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name || '未命名'}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSaveRelation}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
              >
                添加
              </button>
              <button
                type="button"
                onClick={() => { setAddingRelation(false); setRelationError(null) }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated"
              >
                取消
              </button>
            </div>
            {relationError && <p className="mt-1.5 text-xs text-danger">{relationError}</p>}
          </div>
        )}

        <div className="space-y-1.5">
          {(map.relations || []).length === 0 && !addingRelation && (
            <p className="text-sm text-text-tertiary">暂无关系线，点击右上角添加，或由 AI 自动分析生成</p>
          )}
          {(map.relations || []).map((r, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-lg bg-surface-elevated px-3 py-1.5 text-sm">
              <span className="font-medium text-text-primary">{nodeName(r.sourceId)}</span>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: relationColor(r.relation) }}
              >
                {RELATION_LABELS[r.relation] || r.relation}
              </span>
              <ArrowRight size={12} className="text-text-tertiary" />
              <span className="font-medium text-text-primary">{nodeName(r.targetId)}</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDeleteRelation(idx)}
                  className="ml-auto rounded-lg p-1 text-text-tertiary hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 添加/编辑人物 Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={isAdd ? '添加决策链人物' : '编辑人物'}>
        {draftNode && (
          <div className="space-y-3">
            {isAdd && selectableContacts.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">从已有联系人选择（自动带入资料）</label>
                <select
                  value={draftNode.contactId || ''}
                  onChange={(e) => handlePickContact(e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">— 或下方直接填写新联系人 —</option>
                  {selectableContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.position ? `（${c.position}）` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">姓名 *</label>
                <input
                  value={draftNode.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  disabled={!!draftNode.contactId}
                  className={INPUT_CLS}
                  placeholder="姓名"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">职位</label>
                <input
                  value={draftNode.title || ''}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                  className={INPUT_CLS}
                  placeholder="如：信息处主任"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">部门</label>
                <input
                  value={draftNode.department || ''}
                  onChange={(e) => updateDraft({ department: e.target.value })}
                  className={INPUT_CLS}
                  placeholder="如：信息中心"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">电话</label>
                <input
                  value={draftNode.contactInfo?.phone || ''}
                  onChange={(e) => updateDraft({ contactInfo: { ...draftNode.contactInfo, phone: e.target.value } })}
                  className={INPUT_CLS}
                  placeholder="选填"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">决策角色</label>
                <select
                  value={draftNode.role || 'OTHER'}
                  onChange={(e) => updateDraft({ role: e.target.value })}
                  className={INPUT_CLS}
                >
                  {Object.entries(ROLE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">对我方态度</label>
                <select
                  value={draftNode.attitude || 'unknown'}
                  onChange={(e) => updateDraft({ attitude: e.target.value })}
                  className={INPUT_CLS}
                >
                  {Object.entries(ATTITUDE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {!!draftNode.contactId && (
              <p className="text-xs text-text-tertiary">已关联联系人档案，此处补录/修改的职位、部门、电话会同步回档案。</p>
            )}
            {saveError && <p className="text-xs text-danger">{saveError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-elevated"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
