import type { PrismaClient } from '@prisma/client'
import {
  DEFAULT_MILESTONE_GATES,
  MILESTONE_LABELS,
  buildMilestoneGateFromConfig,
  type MilestoneGate,
  type GateRuleNode,
  type GateRule,
  type CompoundRule,
  type EvidenceRequirement,
} from './gate-rules.js'

export interface GateValidationResult {
  passed: boolean
  fromStage: number
  toStage: number
  missing: Array<{ path?: string; label: string }>
  checkedAt: Date
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

export function isEmptyValue(val: unknown): boolean {
  if (val === null || val === undefined) return true
  if (typeof val === 'string' && val.trim() === '') return true
  if (Array.isArray(val) && val.length === 0) return true
  if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val as Record<string, unknown>).length === 0) {
    return true
  }
  return false
}

interface EvidenceRecord {
  type: string
  at: Date
  segment: string | undefined
}

function isCompoundRule(node: GateRuleNode): node is CompoundRule {
  return node.kind === 'compound' || ('operator' in node && Array.isArray((node as { rules?: unknown }).rules))
}

function checkFieldValue(rule: GateRule, projectData: Record<string, unknown>): boolean {
  const val = getNestedValue(projectData, rule.path)
  return rule.validate ? rule.validate(val) : !isEmptyValue(val)
}

function checkEvidenceRequirement(req: EvidenceRequirement, records: EvidenceRecord[]): boolean {
  const min = req.min ?? 1
  const now = new Date()
  let matched = 0
  for (const record of records) {
    if (record.type !== req.type) continue
    if (req.withinDays != null) {
      const daysDiff = (now.getTime() - record.at.getTime()) / (1000 * 60 * 60 * 24)
      if (daysDiff > req.withinDays) continue
    }
    matched++
    if (matched >= min) return true
  }
  return false
}

async function loadEvidenceRecords(prisma: PrismaClient, projectId: string): Promise<EvidenceRecord[]> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { evidenceChain: true },
  })

  const chain = (project?.evidenceChain ?? []) as Array<{
    timelineEventId?: string
    evidenceSegment?: string
  }>

  const eventIds = chain.map((c) => c.timelineEventId).filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (eventIds.length === 0) return []

  const events = await prisma.timelineEvent.findMany({
    where: { id: { in: eventIds } },
    select: { id: true, sourceType: true, eventTime: true },
  })

  const eventMap = new Map(events.map((e) => [e.id, e]))

  return chain
    .map((c) => {
      const event = c.timelineEventId ? eventMap.get(c.timelineEventId) : undefined
      if (!event) return null
      return {
        type: event.sourceType ?? 'unknown',
        at: event.eventTime,
        segment: c.evidenceSegment,
      }
    })
    .filter((r): r is EvidenceRecord => r != null)
}

function evaluateFieldRule(
  rule: GateRule,
  projectData: Record<string, unknown>,
  evidenceRecords: EvidenceRecord[],
): { passed: boolean; missing: Array<{ path?: string; label: string }> } {
  const missing: Array<{ path?: string; label: string }> = []

  const fieldPassed = checkFieldValue(rule, projectData)
  if (!fieldPassed) {
    missing.push({ path: rule.path, label: rule.label })
  }

  const evidenceList = rule.evidence ?? []
  for (const req of evidenceList) {
    if (!checkEvidenceRequirement(req, evidenceRecords)) {
      const withinText = req.withinDays ? `（最近 ${req.withinDays} 天内）` : ''
      missing.push({
        path: rule.path,
        label: `${rule.label} 缺少证据：至少 ${req.min ?? 1} 条 ${req.type}${withinText}`,
      })
    }
  }

  return { passed: missing.length === 0, missing }
}

function evaluateCompoundRule(
  rule: CompoundRule,
  projectData: Record<string, unknown>,
  evidenceRecords: EvidenceRecord[],
): { passed: boolean; missing: Array<{ path?: string; label: string }> } {
  if (rule.operator === 'and') {
    const allMissing: Array<{ path?: string; label: string }> = []
    for (const child of rule.rules) {
      const result = evaluateRuleNode(child, projectData, evidenceRecords)
      if (!result.passed) {
        allMissing.push(...result.missing)
      }
    }
    return { passed: allMissing.length === 0, missing: allMissing }
  }

  if (rule.operator === 'or') {
    for (const child of rule.rules) {
      const result = evaluateRuleNode(child, projectData, evidenceRecords)
      if (result.passed) {
        return { passed: true, missing: [] }
      }
    }
    return { passed: false, missing: [{ label: rule.label }] }
  }

  // not
  if (rule.rules.length === 0) {
    return { passed: true, missing: [] }
  }
  const first = evaluateRuleNode(rule.rules[0], projectData, evidenceRecords)
  if (first.passed) {
    return { passed: false, missing: [{ label: rule.label }] }
  }
  return { passed: true, missing: [] }
}

function evaluateRuleNode(
  node: GateRuleNode,
  projectData: Record<string, unknown>,
  evidenceRecords: EvidenceRecord[],
): { passed: boolean; missing: Array<{ path?: string; label: string }> } {
  if (isCompoundRule(node)) {
    return evaluateCompoundRule(node, projectData, evidenceRecords)
  }
  return evaluateFieldRule(node as GateRule, projectData, evidenceRecords)
}

/**
 * 从 MethodologyConfig 加载当前租户的方法论 gate 规则
 *
 * @param prisma - PrismaClient
 * @param tenantId - 租户 ID
 * @returns 可执行的 MilestoneGate 数组
 */
export async function loadMilestoneGates(prisma: PrismaClient, tenantId: string): Promise<MilestoneGate[]> {
  const config = await prisma.methodologyConfig.findFirst({
    where: { tenantId, moduleType: 'MILESTONE', isActive: true },
  })

  if (config?.configJson) {
    return buildMilestoneGateFromConfig(config.configJson)
  }

  return DEFAULT_MILESTONE_GATES
}

/**
 * 校验里程碑推进是否满足 gate 条件
 *
 * @param prisma - 已注入租户隔离的 PrismaClient
 * @param projectId - 项目 ID
 * @param fromStage - 当前阶段
 * @param toStage - 目标阶段
 * @param gates - gate 规则配置，默认使用 DEFAULT_MILESTONE_GATES
 */
export async function validateMilestoneAdvance(
  prisma: PrismaClient,
  projectId: string,
  fromStage: number,
  toStage: number,
  gates: MilestoneGate[] = DEFAULT_MILESTONE_GATES,
): Promise<GateValidationResult> {
  // 回退或不变更时不校验
  if (toStage <= fromStage) {
    return { passed: true, fromStage, toStage, missing: [], checkedAt: new Date() }
  }

  const gate = gates.find((g) => g.fromStage === fromStage)
  // 找不到对应 gate 时不阻断，避免未知场景造成业务停滞
  if (!gate) {
    return { passed: true, fromStage, toStage, missing: [], checkedAt: new Date() }
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      humanInfo: true,
      businessInfo: true,
      financeInfo: true,
      decisionMap: true,
      evidence: true,
      evidenceChain: true,
    },
  })

  const projectData = (project ?? {}) as Record<string, unknown>
  const evidenceRecords = await loadEvidenceRecords(prisma, projectId)
  const missing: Array<{ path?: string; label: string }> = []

  for (const node of gate.requiredFields) {
    const result = evaluateRuleNode(node, projectData, evidenceRecords)
    if (!result.passed) {
      missing.push(...result.missing)
    }
  }

  return {
    passed: missing.length === 0,
    fromStage,
    toStage,
    missing,
    checkedAt: new Date(),
  }
}

export { DEFAULT_MILESTONE_GATES, MILESTONE_LABELS }
export type { MilestoneGate, GateRule, CompoundRule, GateRuleNode, EvidenceRequirement } from './gate-rules.js'
