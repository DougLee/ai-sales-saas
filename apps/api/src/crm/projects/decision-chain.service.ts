import type { PrismaClient } from '@prisma/client'
import { DecisionMapSchema, type DecisionMapInput, type DecisionRelationInput } from './decision-chain.schema.js'

/** decisionMap JSON 中关系线存储区的解析 schema（节点以 ProjectContact 为准，JSON 只存关系线） */
const StoredRelationsSchema = DecisionMapSchema.shape.relations

export interface DecisionChainSummary {
  nodeCount: number
  decisionMakerCount: number
  coachCount: number
  evaluatorCount: number
  supportiveCount: number
  opposedCount: number
  neutralCount: number
  coverageScore: number
}

export interface DecisionChainView {
  map: DecisionMapInput
  summary: DecisionChainSummary
}

function normalizeAttitude(attitude: string): string {
  const normalized = (attitude || '').toLowerCase()
  if (normalized.includes('support') || normalized.includes('支持') || normalized.includes('positive')) {
    return 'supportive'
  }
  if (normalized.includes('oppos') || normalized.includes('反对') || normalized.includes('negative') || normalized.includes('resist')) {
    return 'opposed'
  }
  if (normalized.includes('neut') || normalized.includes('中立')) {
    return 'neutral'
  }
  return 'unknown'
}

function normalizeRole(role: string): string {
  const normalized = (role || '').toUpperCase()
  if (normalized.includes('COACH') || normalized.includes('教练') || normalized.includes('引路')) {
    return 'COACH'
  }
  if (normalized.includes('EVALUATOR') || normalized.includes('评估')) {
    return 'EVALUATOR'
  }
  if (normalized.includes('DECISION') || normalized.includes('决策')) {
    return 'DECISION_MAKER'
  }
  if (normalized.includes('USER') || normalized.includes('使用')) {
    return 'USER'
  }
  if (normalized.includes('INFLUENCER') || normalized.includes('影响')) {
    return 'INFLUENCER'
  }
  if (normalized.includes('GATEKEEPER') || normalized.includes('把关') || normalized.includes('门卫')) {
    return 'GATEKEEPER'
  }
  return 'OTHER'
}

function mapAttitudeToNode(attitude: string): string {
  const normalized = (attitude || '').toUpperCase()
  if (normalized === 'SUPPORTIVE') return 'supportive'
  if (normalized === 'NEUTRAL') return 'neutral'
  if (normalized === 'RESISTANT') return 'opposed'
  return 'unknown'
}

function mapAttitudeToDb(attitude: string): string {
  const normalized = (attitude || '').toLowerCase()
  if (normalized === 'supportive') return 'SUPPORTIVE'
  if (normalized === 'neutral') return 'NEUTRAL'
  if (normalized === 'opposed') return 'RESISTANT'
  return 'UNKNOWN'
}

/**
 * 将历史遗留 decisionMap 结构（{ contact_0: { name, role, attitude }, ... }）
 * 转换为标准 DecisionMap 结构。
 */
export function migrateLegacyDecisionMap(legacy: unknown): DecisionMapInput {
  if (!legacy || typeof legacy !== 'object') {
    return { nodes: [], relations: [] }
  }

  // 已经是标准结构
  const candidate = legacy as { nodes?: unknown[]; relations?: unknown[] }
  if (Array.isArray(candidate.nodes)) {
    const parsed = DecisionMapSchema.safeParse(candidate)
    if (parsed.success) return parsed.data
  }

  // 旧结构转换
  const nodes: DecisionMapInput['nodes'] = []
  for (const [key, value] of Object.entries(legacy as Record<string, unknown>)) {
    // 跳过数组值（如关系线存储区 relations），避免被当成人物生成垃圾节点
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const v = value as Record<string, unknown>
    const id = key.startsWith('contact_') ? key : `legacy_${key}`
    nodes.push({
      id,
      name: String(v.name || v.title || id),
      role: normalizeRole(String(v.role || '')),
      attitude: normalizeAttitude(String(v.attitude || '')),
      title: v.title ? String(v.title) : undefined,
      department: v.department ? String(v.department) : undefined,
      influence: typeof v.influence === 'number' ? v.influence : undefined,
    })
  }

  return { nodes, relations: [] }
}

function buildSummary(map: DecisionMapInput): DecisionChainSummary {
  const nodes = map.nodes || []
  const decisionMakerCount = nodes.filter((n) => n.role === 'DECISION_MAKER').length
  const coachCount = nodes.filter((n) => n.role === 'COACH').length
  const evaluatorCount = nodes.filter((n) => n.role === 'EVALUATOR').length
  const supportiveCount = nodes.filter((n) => n.attitude === 'supportive').length
  const opposedCount = nodes.filter((n) => n.attitude === 'opposed').length
  const neutralCount = nodes.filter((n) => n.attitude === 'neutral').length

  // 覆盖度：有决策者 + 有教练 + 有评估者 = 100；每缺一个扣 33
  const hasDecisionMaker = decisionMakerCount > 0
  const hasCoach = coachCount > 0
  const hasEvaluator = evaluatorCount > 0
  const coverageScore = (Number(hasDecisionMaker) + Number(hasCoach) + Number(hasEvaluator)) * 33 + (hasDecisionMaker ? 1 : 0)

  return {
    nodeCount: nodes.length,
    decisionMakerCount,
    coachCount,
    evaluatorCount,
    supportiveCount,
    opposedCount,
    neutralCount,
    coverageScore: Math.min(100, coverageScore),
  }
}

export class DecisionChainService {
  constructor(private prisma: PrismaClient) {}

  async get(projectId: string): Promise<DecisionChainView> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: {
        contacts: {
          include: { contact: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    // 优先使用 ProjectContact 关联（和 Contact 表打通）
    if (project?.contacts && project.contacts.length > 0) {
      const nodes = project.contacts.map((pc) => ({
        id: pc.id,
        contactId: pc.contactId,
        name: pc.contact.name,
        title: pc.contact.position || undefined,
        department: pc.contact.department || undefined,
        role: pc.role,
        attitude: mapAttitudeToNode(pc.attitude),
        contactInfo: {
          phone: pc.contact.phone || undefined,
          email: pc.contact.email || undefined,
        },
      }))
      // 关系线持久化在 decisionMap JSON（节点以 ProjectContact 为准），过滤两端节点已删除的悬空线
      const nodeIds = new Set(nodes.map((n) => n.id))
      const stored = StoredRelationsSchema.safeParse(
        (project.decisionMap as { relations?: unknown } | null)?.relations,
      )
      const relations: DecisionRelationInput[] = (stored.success ? stored.data : []).filter(
        (r) => nodeIds.has(r.sourceId) && nodeIds.has(r.targetId),
      )
      const map = { nodes, relations }
      return { map, summary: buildSummary(map) }
    }

    // 兼容历史 decisionMap JSON
    const map = migrateLegacyDecisionMap(project?.decisionMap)
    return { map, summary: buildSummary(map) }
  }

  async update(projectId: string, data: DecisionMapInput): Promise<DecisionChainView> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { company: true },
    })
    if (!project) throw new Error('Project not found')

    const existing = await this.prisma.projectContact.findMany({
      where: { projectId },
    })
    const existingMap = new Map(existing.map((pc) => [pc.id, pc]))
    const incomingIds = new Set(data.nodes.map((n) => n.id))

    // 删除不在请求中的 ProjectContact
    for (const pc of existing) {
      if (!incomingIds.has(pc.id)) {
        await this.prisma.projectContact.delete({ where: { id: pc.id } })
      }
    }

    // 创建或更新；idMap 记录「请求 node.id → 落库 ProjectContact.id」，
    // 新增人物的请求 id 是前端临时 id，关系线落库前必须重写为真实 id
    const idMap = new Map<string, string>()
    for (const node of data.nodes) {
      const role = normalizeRole(node.role)
      const attitude = mapAttitudeToDb(node.attitude) as 'SUPPORTIVE' | 'NEUTRAL' | 'RESISTANT' | 'UNKNOWN'

      if (node.contactId) {
        const existingPc = existingMap.get(node.id)
        if (existingPc) {
          await this.prisma.projectContact.update({
            where: { id: existingPc.id },
            data: { role, attitude },
          })
          idMap.set(node.id, existingPc.id)
        } else {
          const pc = await this.prisma.projectContact.create({
            data: {
              projectId,
              contactId: node.contactId,
              role,
              attitude,
            },
          })
          idMap.set(node.id, pc.id)
        }
      } else {
        // 新建联系人并关联
        const contact = await this.prisma.contact.create({
          data: {
            tenantId: project.tenantId,
            name: node.name,
            position: node.title,
            department: node.department,
            phone: node.contactInfo?.phone,
            email: node.contactInfo?.email,
            companyId: project.company?.id || undefined,
          },
        })
        const pc = await this.prisma.projectContact.create({
          data: {
            projectId,
            contactId: contact.id,
            role,
            attitude,
          },
        })
        idMap.set(node.id, pc.id)
      }
    }

    // 关系线持久化到 decisionMap JSON（节点本体以 ProjectContact 为准，JSON 只存关系线）：
    // 重写为落库 id 并过滤两端节点已不存在的悬空线
    const validIds = new Set(idMap.values())
    const relations: DecisionRelationInput[] = (data.relations || [])
      .map((r) => ({
        sourceId: idMap.get(r.sourceId) ?? r.sourceId,
        targetId: idMap.get(r.targetId) ?? r.targetId,
        relation: r.relation,
      }))
      .filter((r) => validIds.has(r.sourceId) && validIds.has(r.targetId))

    // P0-2：节点快照同步回写 decisionMap.nodes（M6 门禁读 project.decisionMap.nodes），
    // 保持 decision-chain 接口与主表单一事实来源；读取时仍以 ProjectContact 为准
    const nodes = data.nodes.map((node) => ({
      id: idMap.get(node.id) ?? node.id,
      contactId: node.contactId,
      name: node.name,
      title: node.title,
      department: node.department,
      role: normalizeRole(node.role),
      attitude: node.attitude,
    }))

    await this.prisma.project.update({
      where: { id: projectId },
      data: { decisionMap: { nodes, relations } as never },
    })

    return this.get(projectId)
  }
}
