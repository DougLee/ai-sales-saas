import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { DEFAULT_MILESTONE_GATE_RULES } from '@ai-sales/shared'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'
import { canAccess } from '../../lib/data-scope.js'
import {
  FIELD_VERIFY_REQ,
  SOURCE_KEY,
  addSourceToMeta,
  deleteEvidenceSourcesByName,
  insertEvidenceSource,
  levelFromSources,
  readFieldSourcesWithFallback,
  type GateFieldMeta,
} from './verification-tiers.js'

/**
 * 阶段档案字段写入口（ADR-0004 决策 5/6 + ADR-0005 水位体系；#33 A1 落表）
 *
 * - 人工编辑：level=manual（自述·未验证），材料到达后被印证或覆盖
 * - manual-pass 豁免：映射 final 档（理由必填、时间轴留痕）
 * - addSource / revokeSource：来源链累积与撤销（水位升降）
 * - confirmDecision：decision 级字段由 cross 升 final（决策人坐实）
 *
 * #33 双写：来源链变更同时写 EvidenceSource 表（真相源，每来源一行）与
 * evidence._gateFieldSource JSON（镜像，存量读路径兼容）。读口径表优先。
 * sourceType 映射：手动登记='manual'，决策人确认='decision_maker'，豁免='manual'。
 */

/** 允许人工直写值的字段（字符串形态；数组形态字段仅支持 manual-pass） */
const STRING_PATHS = new Set([
  'humanInfo.firstContact',
  'businessInfo.requirements',
  'financeInfo.budget',
  'businessInfo.solution',
  'financeInfo.price',
  'evidence.bidResult',
])

const ALL_PATHS = new Set<string>()
for (const rule of DEFAULT_MILESTONE_GATE_RULES) {
  for (const f of rule.requiredFields) {
    if ('path' in f) ALL_PATHS.add(f.path)
    else for (const sub of f.rules) if ('path' in sub) ALL_PATHS.add(sub.path)
  }
}

function sectionKeyOf(section: string): string {
  if (section === 'evidence') return 'evidence'
  return `${section}Info`
}

function fieldLabel(path: string): string {
  const map: Record<string, string> = {
    'humanInfo.firstContact': '首次接触方式',
    'humanInfo.painPoints': '痛点列表',
    'businessInfo.requirements': '需求指标',
    'financeInfo.budget': '预算金额',
    'businessInfo.solution': '方案要点',
    'financeInfo.price': '报价金额',
    'decisionMap.nodes': '决策链人物',
    'evidence.bidResult': '中标结果',
  }
  return map[path] ?? path
}

const GateFieldBodySchema = z.union([
  // 人工录入
  z.object({ path: z.string(), value: z.string().min(1) }),
  // 豁免（ADR-0004）
  z.object({ path: z.string(), manualPass: z.literal(true), reason: z.string().min(1) }),
  z.object({ path: z.string(), manualPass: z.literal(false), reason: z.string().optional() }),
  // 来源链（ADR-0005）
  z.object({ path: z.string(), addSource: z.string().min(1) }),
  z.object({ path: z.string(), revokeSource: z.string().min(1) }),
  // 决策人坐实（ADR-0005）
  z.object({ path: z.string(), confirmDecision: z.literal(true) }),
])

export async function updateGateField(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = req.user as { id: string; tenantId: string; role: string }
    const parsed = GateFieldBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: '参数不合法：{path,value} / {path,manualPass,reason} / {path,addSource} / {path,revokeSource} / {path,confirmDecision}' })
    }
    const body = parsed.data

    const project = await prisma.project.findFirst({ where: { id: req.params.id, deletedAt: null } })
    if (!project) return reply.status(404).send({ success: false, error: '商机不存在' })
    const hasAccess = await canAccess(prisma, user as never, project.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权修改此商机' })

    if (!ALL_PATHS.has(body.path)) {
      return reply.status(400).send({ success: false, error: `字段 ${body.path} 不在门禁白名单内` })
    }

    const evidence = { ...((project.evidence as Record<string, unknown>) || {}) }
    // #33 A1：读口径表优先，表无记录回退 JSON 镜像（存量兼容）
    const sources = await readFieldSourcesWithFallback(prisma, project.id, project.evidence as Record<string, unknown> | null)
    const data: Record<string, unknown> = {}
    const record = project as unknown as Record<string, unknown>
    const tenantId = project.tenantId || user.tenantId
    // 表写失败不阻塞主流程（JSON 镜像兜底），错误只吞不抛
    const insertRow = (fieldPath: string, sourceName: string, sourceType: string, verifiedLevel: string) =>
      insertEvidenceSource(prisma, {
        tenantId, projectId: project.id, fieldPath, sourceName, sourceType, verifiedLevel,
      }).catch(() => {})
    const removeRows = (fieldPath: string, names?: string[]) =>
      deleteEvidenceSourcesByName(prisma, project.id, fieldPath, names).catch(() => {})

    const setMeta = (path: string, meta: GateFieldMeta) => {
      sources[path] = meta
      evidence[SOURCE_KEY] = sources
      data.evidence = evidence
    }

    if ('value' in body) {
      if (!STRING_PATHS.has(body.path)) {
        return reply.status(400).send({ success: false, error: `字段 ${body.path} 为列表形态，不支持直接填写，请用「标记达标」` })
      }
      const [section, key] = body.path.split('.')
      const sk = sectionKeyOf(section)
      const sectionObj = { ...((record[sk] as Record<string, unknown>) || {}) }
      sectionObj[key] = body.value
      data[sk] = sectionObj
      // 手填 = 自述·未验证（ADR-0005）：清来源、降 manual
      setMeta(body.path, { level: 'manual', sources: [] })
      await removeRows(body.path) // 清空该字段全部来源行
    } else if ('manualPass' in body && body.manualPass === true) {
      if (!body.reason?.trim()) {
        return reply.status(400).send({ success: false, error: '标记达标必须填写理由（将记录到时间轴）' })
      }
      setMeta(body.path, { level: 'final', sources: ['豁免'] })
      await removeRows(body.path) // 豁免独占来源链（与 JSON 口径一致）
      await insertRow(body.path, '豁免', 'manual', 'final')
    } else if ('manualPass' in body && body.manualPass === false) {
      delete sources[body.path]
      evidence[SOURCE_KEY] = sources
      data.evidence = evidence
      await removeRows(body.path)
    } else if ('addSource' in body) {
      const existing = sources[body.path] ?? { level: 'manual' as const, sources: [] }
      setMeta(body.path, addSourceToMeta(existing, body.addSource))
      if (!existing.sources.includes(body.addSource)) {
        await insertRow(body.path, body.addSource, 'manual', 'single')
      }
    } else if ('revokeSource' in body) {
      const existing = sources[body.path]
      if (!existing || !existing.sources.includes(body.revokeSource)) {
        return reply.status(400).send({ success: false, error: `来源「${body.revokeSource}」不存在` })
      }
      const remain = existing.sources.filter((s) => s !== body.revokeSource)
      // 撤销来源 → 水位降级；final 只有豁免/决策人两类来源，撤销即退出 final
      const level = levelFromSources('manual', remain, true)
      setMeta(body.path, { level, sources: remain })
      await removeRows(body.path, [body.revokeSource])
    } else if ('confirmDecision' in body) {
      if (FIELD_VERIFY_REQ[body.path] !== 'decision') {
        return reply.status(400).send({ success: false, error: '仅 decision 级字段（方案/报价/决策链）支持决策人坐实' })
      }
      const existing = sources[body.path] ?? { level: 'manual' as const, sources: [] }
      setMeta(body.path, { level: 'final', sources: [...new Set([...existing.sources, '决策人确认'])] })
      if (!existing.sources.includes('决策人确认')) {
        await insertRow(body.path, '决策人确认', 'decision_maker', 'final')
      }
    }

    await prisma.project.update({ where: { id: project.id }, data: data as never })

    // 时间轴留痕（来源/水位变化也记，便于审计弱锚定历史）
    const isLevelChange = 'addSource' in body || 'revokeSource' in body || 'confirmDecision' in body
    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: project.companyId || project.id,
      projectId: project.id,
      eventType: isLevelChange ? ActivityEventType.MILESTONE_GATE_PASSED : ActivityEventType.PROJECT_UPDATED,
      eventSubtype: 'value' in body ? '阶段档案-人工录入'
        : ('manualPass' in body && body.manualPass === true) ? '阶段档案-标记达标'
        : ('manualPass' in body && body.manualPass === false) ? '阶段档案-清除标记'
        : 'addSource' in body ? '阶段档案-来源累积'
        : 'revokeSource' in body ? '阶段档案-来源撤销'
        : '阶段档案-决策人坐实',
      eventData: {
        path: body.path,
        label: fieldLabel(body.path),
        ...('value' in body ? { value: body.value } : {}),
        ...('reason' in body && typeof body.reason === 'string' ? { reason: body.reason } : {}),
        ...('addSource' in body ? { source: body.addSource } : {}),
        ...('revokeSource' in body ? { source: body.revokeSource } : {}),
        level: sources[body.path]?.level,
      },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: 'value' in body ? '人工录入门禁字段'
        : ('manualPass' in body && body.manualPass === true) ? '单字段豁免（manual-pass）'
        : 'addSource' in body ? '材料来源累积（交叉验证）'
        : 'revokeSource' in body ? '来源撤销（水位降级）'
        : '决策人确认（坐实）',
    })

    reply.send({ success: true, data: { level: sources[body.path]?.level, sources: sources[body.path]?.sources } })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
