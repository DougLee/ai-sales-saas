import type { PrismaClient } from '@prisma/client'

/**
 * 验证水位工具（ADR-0005 推进卡 v2；#33 A1 落表改造）
 *
 * 四级水位：manual(自述) < single(单源) < cross(交叉) < final(坐实)
 * 字段验证要求：material(有材料即可=1) / cross(≥2来源=2) / decision(决策人坐实=3)
 *
 * 存储（#33 双写过渡）：
 * - 真相源：EvidenceSource 表（每来源一行，groupBy fieldPath 聚合推导水位）
 * - 镜像：project.evidence._gateFieldSource：{ [path]: { level, sources: [] } }（存量数据兼容）
 * 读路径优先表，表内该项目无记录时回退 JSON（ADR-0004 旧 string 结构继续兼容）。
 */

export type VerifyLevel = 'manual' | 'single' | 'cross' | 'final'
export type VerifyReq = 'material' | 'cross' | 'decision'

export const LEVEL_RANK: Record<VerifyLevel, number> = { manual: 0, single: 1, cross: 2, final: 3 }
export const REQ_LEVEL: Record<VerifyReq, number> = { material: 1, cross: 2, decision: 3 }

/** 各 gate 字段的验证要求档位（ADR-0005 决策 5） */
export const FIELD_VERIFY_REQ: Record<string, VerifyReq> = {
  'humanInfo.firstContact': 'material',
  'humanInfo.painPoints': 'cross',
  'businessInfo.requirements': 'cross',
  'financeInfo.budget': 'cross',
  'businessInfo.solution': 'decision',
  'financeInfo.price': 'decision',
  'decisionMap.nodes': 'decision',
  'evidence.bidResult': 'material',
}

export interface GateFieldMeta {
  level: VerifyLevel
  sources: string[]
}

export const SOURCE_KEY = '_gateFieldSource'
export const ANCHOR_KEY = '_anchors'

type EvidenceLike = Record<string, unknown> | null | undefined

/** 读取字段水位映射（JSON 镜像；兼容旧 string 结构） */
export function readFieldSources(evidence: EvidenceLike): Record<string, GateFieldMeta> {
  const raw = (evidence as Record<string, unknown> | null)?.[SOURCE_KEY]
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, GateFieldMeta> = {}
  for (const [path, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') {
      // ADR-0004 旧结构：manual / manual-pass
      out[path] = { level: v === 'manual-pass' ? 'final' : 'manual', sources: v === 'manual-pass' ? ['豁免'] : [] }
    } else if (v && typeof v === 'object') {
      const m = v as Partial<GateFieldMeta>
      out[path] = { level: (m.level as VerifyLevel) || 'manual', sources: Array.isArray(m.sources) ? m.sources : [] }
    }
  }
  return out
}

// ============================================
// #33 A1：EvidenceSource 表读写（真相源）
// ============================================

/** EvidenceSource 行（读路径最小投影） */
export interface EvidenceSourceRow {
  fieldPath: string
  sourceType: string
  sourceName: string
  verifiedLevel: string
}

/** 结构化 prisma 参数（测试可 mock；真调用方传 PrismaClient） */
export interface EvidenceSourceDb {
  evidenceSource: {
    findMany(args: unknown): Promise<EvidenceSourceRow[]>
    create(args: unknown): Promise<unknown>
    deleteMany(args: unknown): Promise<{ count: number }>
  }
}

/** 按来源名推导 sourceType（accumulate/豁免等入口的人类可读来源名 → 枚举口径） */
export function sourceTypeFromName(sourceName: string): string {
  if (sourceName.includes('决策人')) return 'decision_maker'
  if (sourceName.includes('豁免')) return 'manual'
  if (sourceName.includes('文档') || sourceName.includes('方案')) return 'doc'
  if (sourceName.includes('录音') || sourceName.includes('材料') || sourceName.includes('拜访')) return 'visit_audio'
  return 'manual'
}

/**
 * 行集合 → 水位（groupBy fieldPath 聚合口径）：
 * 任一行 verifiedLevel='final'（豁免/决策人坐实）→ final；
 * 来源名去重 ≥2 → cross；=1 → single；0 → manual。
 */
export function levelFromEvidenceRows(rows: EvidenceSourceRow[]): VerifyLevel {
  if (rows.some((r) => r.verifiedLevel === 'final')) return 'final'
  const distinctNames = [...new Set(rows.map((r) => r.sourceName))]
  return levelFromSources('manual', distinctNames, true)
}

/** 行集合 → 全字段水位映射（fieldPath 分组聚合） */
export function aggregateEvidenceSources(rows: EvidenceSourceRow[]): Record<string, GateFieldMeta> {
  const byPath = new Map<string, EvidenceSourceRow[]>()
  for (const r of rows) {
    const list = byPath.get(r.fieldPath)
    if (list) list.push(r)
    else byPath.set(r.fieldPath, [r])
  }
  const out: Record<string, GateFieldMeta> = {}
  for (const [path, list] of byPath) {
    const sources = [...new Set(list.map((r) => r.sourceName))]
    out[path] = { level: levelFromEvidenceRows(list), sources }
  }
  return out
}

/**
 * 表优先读字段水位映射；该项目表内无任何记录 → null（调用方回退 JSON 镜像）。
 */
export async function readFieldSourcesFromDb(
  db: EvidenceSourceDb,
  projectId: string,
): Promise<Record<string, GateFieldMeta> | null> {
  const rows = await db.evidenceSource.findMany({
    where: { projectId, revokedAt: null },
    select: { fieldPath: true, sourceType: true, sourceName: true, verifiedLevel: true },
    orderBy: { extractedAt: 'asc' },
  })
  if (rows.length === 0) return null
  return aggregateEvidenceSources(rows)
}

/**
 * 读字段水位映射（#33 A1 读路径统一入口）：表优先，表无记录回退 JSON 镜像（存量兼容）。
 * 混合态（表只有部分字段的行，如刚落表、其他字段还是 JSON/manual-pass 旧数据）：
 * JSON 垫底 + 表覆盖同字段，避免存量豁免标记在首行落表后"消失"。
 */
export async function readFieldSourcesWithFallback(
  db: EvidenceSourceDb,
  projectId: string,
  evidence: EvidenceLike,
): Promise<Record<string, GateFieldMeta>> {
  const fromDb = await readFieldSourcesFromDb(db, projectId)
  if (!fromDb) return readFieldSources(evidence)
  return { ...readFieldSources(evidence), ...fromDb }
}

/** 写一行 EvidenceSource（每来源一行；失败不阻塞主流程由调用方决定） */
export async function insertEvidenceSource(
  db: EvidenceSourceDb,
  data: {
    tenantId: string
    projectId: string
    milestone?: number
    fieldPath: string
    sourceName: string
    sourceType?: string
    sourceRefId?: string | null
    verifiedLevel?: string
  },
): Promise<void> {
  await db.evidenceSource.create({
    data: {
      tenantId: data.tenantId,
      projectId: data.projectId,
      milestone: data.milestone ?? 0,
      fieldPath: data.fieldPath,
      sourceType: data.sourceType ?? sourceTypeFromName(data.sourceName),
      sourceName: data.sourceName,
      sourceRefId: data.sourceRefId ?? null,
      verifiedLevel: data.verifiedLevel ?? 'single',
    },
  })
}

/** 撤销来源 = 删对应行（按 fieldPath + sourceName 精确匹配；sourceNames 省略 = 删该字段全部行） */
export async function deleteEvidenceSourcesByName(
  db: EvidenceSourceDb,
  projectId: string,
  fieldPath: string,
  sourceNames?: string[],
): Promise<void> {
  if (sourceNames && sourceNames.length === 0) return
  await db.evidenceSource.deleteMany({
    where: sourceNames
      ? { projectId, fieldPath, sourceName: { in: sourceNames } }
      : { projectId, fieldPath },
  })
}

/** 计算字段当前应有水位（按来源数；final 由显式动作设置不自动降） */
export function levelFromSources(current: VerifyLevel, sources: string[], hasValue: boolean): VerifyLevel {
  if (!hasValue) return 'manual'
  if (current === 'final') return 'final'
  if (sources.length >= 2) return 'cross'
  if (sources.length === 1) return 'single'
  return 'manual'
}

/** 给字段累积来源（visits.analysis 与 addSource 共用）：第二来源 → cross */
export function addSourceToMeta(meta: GateFieldMeta, sourceName: string): GateFieldMeta {
  const sources = meta.sources.includes(sourceName) ? meta.sources : [...meta.sources, sourceName]
  const level = levelFromSources(meta.level, sources, true)
  return { level, sources }
}

/**
 * 计算某阶段 gate 字段的水位达标情况（推进锚定用）。
 * 字段有值但水位 < 要求 → 计入未达标。
 */
export function computeAnchorStrength(
  project: { evidence?: EvidenceLike } & Record<string, unknown>,
  gatePaths: string[],
): { strong: boolean; belowReq: Array<{ path: string; label?: string }> } {
  const metas = readFieldSources(project.evidence)
  const belowReq: Array<{ path: string; label?: string }> = []
  for (const path of gatePaths) {
    const req = FIELD_VERIFY_REQ[path] ?? 'material'
    const meta = metas[path]
    if (!meta) {
      belowReq.push({ path }) // 有值但无来源记录（如历史数据）→ 视为未达水位
      continue
    }
    if (LEVEL_RANK[meta.level] < REQ_LEVEL[req]) belowReq.push({ path })
  }
  return { strong: belowReq.length === 0, belowReq }
}

/**
 * visits.analysis 用：为已有值的 gate 字段累积来源（升级 single→cross）
 * #33 A1：双写 —— EvidenceSource 表（真相源，每来源一行）+ evidence._gateFieldSource JSON（镜像）。
 * 读口径表优先（表无记录回退 JSON），签名不变，visits.analysis 调用方零改动。
 */
export async function accumulateGateFieldSource(
  prisma: PrismaClient,
  projectId: string,
  path: string,
  sourceName: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { tenantId: true, evidence: true },
  })
  if (!project) return
  const metas = await readFieldSourcesWithFallback(prisma, projectId, project.evidence as EvidenceLike)
  const existing = metas[path]
  if (!existing || existing.sources.includes(sourceName)) return // 无记录（历史数据）或来源重复则跳过

  // 写 1/2：EvidenceSource 表（失败不阻塞镜像写入）
  try {
    await insertEvidenceSource(prisma, {
      tenantId: project.tenantId,
      projectId,
      fieldPath: path,
      sourceName,
    })
  } catch {
    // 表写入失败（如旧库未跑迁移）→ 仍以 JSON 镜像为准
  }

  // 写 2/2：JSON 镜像
  const evidence = { ...((project.evidence as Record<string, unknown>) || {}) }
  const next = addSourceToMeta(existing, sourceName)
  metas[path] = next
  evidence[SOURCE_KEY] = metas
  await prisma.project.update({ where: { id: projectId }, data: { evidence } as never })
}
