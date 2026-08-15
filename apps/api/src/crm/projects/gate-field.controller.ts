import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { DEFAULT_MILESTONE_GATE_RULES } from '@ai-sales/shared'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'
import { canAccess } from '../../lib/data-scope.js'

/**
 * 阶段档案字段的人工写入口（ADR-0004 决策 5/6）
 *
 * - 人工编辑（source=manual）：AI 提取不是 gate 字段的唯一通路——人工值落库后，
 *   既有 auto-apply"只写字段为空"的规则天然保证 AI 不覆盖人工值
 * - manual-pass 单字段逃生门：信息天然不从拜访来的字段（中标公告/组织调研），
 *   理由必填、时间轴留痕；gate 校验对该字段放行
 *
 * 来源标记存储：project.evidence._gateFieldSource（path → 'manual' | 'manual-pass'）。
 * AI auto-apply 不写该映射——字段有值且无映射 = AI 提取产物（推断，无需改动 auto-apply）。
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

/** 允许 manual-pass 的字段 = 全部 gate 路径（含数组形态的 painPoints / decisionMap.nodes） */
const ALL_PATHS = new Set<string>()
for (const rule of DEFAULT_MILESTONE_GATE_RULES) {
  for (const f of rule.requiredFields) {
    if ('path' in f) ALL_PATHS.add(f.path)
    else for (const sub of f.rules) if ('path' in sub) ALL_PATHS.add(sub.path)
  }
}

/** 来源映射的存储位置（嵌在 evidence JSON 内，免 schema 迁移） */
const SOURCE_KEY = '_gateFieldSource'

const GateFieldBodySchema = z.union([
  z.object({ path: z.string(), value: z.string().min(1) }),
  z.object({ path: z.string(), manualPass: z.literal(true), reason: z.string().min(1) }),
  z.object({ path: z.string(), manualPass: z.literal(false), reason: z.string().optional() }),
])

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

export async function updateGateField(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = req.user as { id: string; tenantId: string; role: string }
    const parsed = GateFieldBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: '参数不合法：需 {path, value} 或 {path, manualPass: true, reason}' })
    }
    const body = parsed.data

    const project = await prisma.project.findFirst({ where: { id: req.params.id, deletedAt: null } })
    if (!project) return reply.status(404).send({ success: false, error: '商机不存在' })
    const hasAccess = await canAccess(prisma, user as never, project.ownerId)
    if (!hasAccess) return reply.status(403).send({ success: false, error: '无权修改此商机' })

    if (!ALL_PATHS.has(body.path)) {
      return reply.status(400).send({ success: false, error: `字段 ${body.path} 不在门禁白名单内` })
    }

    // 来源映射（嵌 evidence JSON）
    const evidence = { ...((project.evidence as Record<string, unknown>) || {}) }
    const sources = { ...((evidence[SOURCE_KEY] as Record<string, string>) || {}) }
    const data: Record<string, unknown> = {}
    const record = project as unknown as Record<string, unknown>

    if ('value' in body) {
      if (!STRING_PATHS.has(body.path)) {
        return reply.status(400).send({ success: false, error: `字段 ${body.path} 为列表形态，不支持直接填写，请用「标记达标」` })
      }
      const [section, key] = body.path.split('.')
      const sk = sectionKeyOf(section)
      const sectionObj = { ...((record[sk] as Record<string, unknown>) || {}) }
      sectionObj[key] = body.value
      data[sk] = sectionObj
      sources[body.path] = 'manual'
    } else if (body.manualPass === true) {
      if (!body.reason?.trim()) {
        return reply.status(400).send({ success: false, error: '标记达标必须填写理由（将记录到时间轴）' })
      }
      sources[body.path] = 'manual-pass'
    } else {
      // manualPass=false：清除该字段的豁免/人工标记
      delete sources[body.path]
    }

    evidence[SOURCE_KEY] = sources
    data.evidence = evidence

    await prisma.project.update({ where: { id: project.id }, data: data as never })

    await recordTimelineEvent(prisma, {
      tenantId: user.tenantId,
      customerId: project.companyId || project.id,
      projectId: project.id,
      eventType: 'value' in body ? ActivityEventType.PROJECT_UPDATED : ActivityEventType.MILESTONE_GATE_PASSED,
      eventSubtype: 'value' in body ? '阶段档案-人工录入' : body.manualPass ? '阶段档案-标记达标' : '阶段档案-清除标记',
      eventData: {
        path: body.path,
        label: fieldLabel(body.path),
        ...('value' in body ? { value: body.value } : { reason: body.reason }),
      },
      sourceType: 'user',
      sourceId: user.id,
      sourceLabel: 'value' in body ? '人工录入门禁字段' : '单字段豁免（manual-pass）',
    })

    reply.send({ success: true })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
