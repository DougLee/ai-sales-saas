import type { PrismaClient } from '@prisma/client'

/**
 * 验证水位工具（ADR-0005 推进卡 v2）
 *
 * 四级水位：manual(自述) < single(单源) < cross(交叉) < final(坐实)
 * 字段验证要求：material(有材料即可=1) / cross(≥2来源=2) / decision(决策人坐实=3)
 *
 * 存储于 project.evidence._gateFieldSource：{ [path]: { level, sources: [] } }
 * 兼容旧 string 值（'manual' | 'manual-pass'，ADR-0004 时期结构）。
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

/** 读取字段水位映射（兼容旧 string 结构） */
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

/** visits.analysis 用：为已有值的 gate 字段累积来源（升级 single→cross） */
export async function accumulateGateFieldSource(
  prisma: PrismaClient,
  projectId: string,
  path: string,
  sourceName: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { evidence: true },
  })
  if (!project) return
  const evidence = { ...((project.evidence as Record<string, unknown>) || {}) }
  const metas = readFieldSources(project.evidence as EvidenceLike)
  const existing = metas[path]
  if (!existing || existing.sources.includes(sourceName)) return // 无记录（历史数据）或来源重复则跳过
  const next = addSourceToMeta(existing, sourceName)
  metas[path] = next
  evidence[SOURCE_KEY] = metas
  await prisma.project.update({ where: { id: projectId }, data: { evidence } as never })
}
