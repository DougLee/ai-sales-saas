import type { PrismaClient } from '@prisma/client'
import { generateText } from 'ai'
import { createModel } from '../../config/model-provider.js'
import { llmConcurrencyLimiter } from '../../infra/concurrency-limiter.js'
import { validateMilestoneAdvance, loadMilestoneGates, MILESTONE_LABELS } from '../../milestone-gate/index.js'
import { refreshClosure } from './closure.service.js'
import { logger } from '../../infra/logger.js'

/**
 * 拜访准备素材服务（V6.1 §5.2 节点2：拜访准备 → AI 自动生成素材）
 *
 * Phase 3 从 visits.analysis.controller 的 prep 接口提取为独立服务：
 * - HTTP 手动触发（/api/visits/prep）与队列自动触发（visit-preparation worker）共用
 * - 产物落 visit.attachments（type='visit_prep'），作为闭环 has_preparation 节点的判定依据
 */

export interface VisitPrepMaterial {
  objective?: string
  mustGetInfo?: string[]
  suggestedQuestions?: string[]
  riskAlerts?: string[]
  talkingPoints?: string[]
  missingFields: string[]
  currentStage: string
  backgroundSummary: string
  contactIntel: string
}

/** 生成拜访准备素材（纯生成，不落库） */
export async function generatePrepMaterial(
  prisma: PrismaClient,
  opts: { tenantId: string; projectId: string; userId: string },
): Promise<VisitPrepMaterial> {
  const { tenantId, projectId, userId } = opts

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      company: true,
      contacts: { include: { contact: true } },
      visits: { take: 5, orderBy: { visitTime: 'desc' } },
    },
  })
  if (!project) throw new Error('商机不存在')

  const gates = await loadMilestoneGates(prisma, tenantId)
  const gateResult = await validateMilestoneAdvance(
    prisma,
    projectId,
    project.milestone,
    project.milestone + 1,
    gates,
  )
  const missingFields = gateResult.missing.map((m) => m.label)

  // 构建客户背景摘要
  const backgroundSummaryLines: string[] = []
  if (project.company) {
    backgroundSummaryLines.push(`客户名称: ${project.company.name}`)
    if (project.company.industry) backgroundSummaryLines.push(`行业: ${project.company.industry}`)
    if (project.company.scale) backgroundSummaryLines.push(`规模: ${project.company.scale}`)
    if (project.company.region) backgroundSummaryLines.push(`区域: ${project.company.region}`)
  }
  backgroundSummaryLines.push(`商机名称: ${project.name}`)
  backgroundSummaryLines.push(`当前阶段: M${project.milestone} (${MILESTONE_LABELS[project.milestone]})`)
  if (project.amount) backgroundSummaryLines.push(`预计金额: ${project.amount}`)
  if (project.urgency) backgroundSummaryLines.push(`紧急度: ${project.urgency}`)
  const humanInfo = (project.humanInfo as Record<string, unknown>) || {}
  if (humanInfo.painPoints) backgroundSummaryLines.push(`已知痛点: ${JSON.stringify(humanInfo.painPoints)}`)
  const financeInfo = (project.financeInfo as Record<string, unknown>) || {}
  if (financeInfo.budget) backgroundSummaryLines.push(`预算情况: ${financeInfo.budget}`)
  const businessInfo = (project.businessInfo as Record<string, unknown>) || {}
  if (businessInfo.requirements) backgroundSummaryLines.push(`需求要点: ${businessInfo.requirements}`)

  // 构建联系人情报
  const contactIntelLines: string[] = []
  if (project.contacts?.length) {
    project.contacts.forEach((pc) => {
      const c = pc.contact
      const intel = [`${c.name} (${c.position || '未知职位'})`]
      if (pc.role) intel.push(`项目角色: ${pc.role}`)
      if (c.decisionRole) intel.push(`决策角色: ${c.decisionRole}`)
      if (c.department) intel.push(`部门: ${c.department}`)
      if (c.phone) intel.push(`电话: ${c.phone}`)
      if (c.email) intel.push(`邮箱: ${c.email}`)
      contactIntelLines.push(intel.join(' | '))
    })
  }

  const contextLines: string[] = []
  contextLines.push(`商机名称: ${project.name}`)
  contextLines.push(`当前里程碑: M${project.milestone} (${MILESTONE_LABELS[project.milestone]})`)
  if (project.company) contextLines.push(`客户: ${project.company.name}`)
  if (project.contacts?.length) {
    contextLines.push('已知联系人:')
    project.contacts.forEach((pc) => {
      const c = pc.contact
      contextLines.push(`  - ${c.name} (${c.position || '未知职位'}) [${pc.role || '未知角色'}] 决策角色:${c.decisionRole || '未知'} 部门:${c.department || '未知'}`)
    })
  }
  if (missingFields.length > 0) {
    contextLines.push(`本阶段缺失信息: ${missingFields.join('、')}`)
  }
  if (project.visits?.length) {
    contextLines.push('近期拜访记录:')
    project.visits.forEach((v) => {
      contextLines.push(`  - ${new Date(v.visitTime).toLocaleDateString('zh-CN')}: ${(v.summary || '').slice(0, 60)}`)
    })
  }

  const prompt = `请作为销售拜访教练，基于以下商机背景，为销售人员生成本次拜访的结构化准备方案。

【客户背景摘要】
${backgroundSummaryLines.join('\n') || '无'}

【联系人情报】
${contactIntelLines.join('\n') || '无'}

【商机背景】
${contextLines.join('\n')}

请输出 JSON 格式：
{
  "objective": "本次拜访核心目标（一句话）",
  "mustGetInfo": ["必须确认的信息1", "必须确认的信息2"],
  "suggestedQuestions": ["建议询问的问题1", "建议询问的问题2"],
  "riskAlerts": ["风险提示1"],
  "talkingPoints": ["话题要点1", "话题要点2"]
}

只返回合法JSON，不要markdown代码块。`

  const { text } = await llmConcurrencyLimiter.run(userId, () =>
    generateText({
      model: createModel() as unknown as Parameters<typeof generateText>[0]['model'],
      prompt,
      temperature: 0.3,
    }),
  )

  let prep: Record<string, unknown> = {}
  try {
    const clean = text.replace(/^```json\s*|\s*```$/g, '').trim()
    prep = JSON.parse(clean)
  } catch {
    prep = { objective: '推进商机阶段，获取关键信息', mustGetInfo: missingFields, suggestedQuestions: [], riskAlerts: [], talkingPoints: [] }
  }

  return {
    ...prep,
    missingFields,
    currentStage: MILESTONE_LABELS[project.milestone],
    backgroundSummary: backgroundSummaryLines.join('\n'),
    contactIntel: contactIntelLines.join('\n') || '暂无联系人情报',
  }
}

/**
 * 为一次拜访自动生成准备素材并落库（visit-preparation worker 用）
 *
 * - 产物写 visit.attachments（type='visit_prep'），重复生成时替换旧条目（幂等）
 * - workflowStage 从 DRAFT/PREPARING 推进到 READY
 * - 刷新闭环（has_preparation 节点）
 */
export async function applyPreparationToVisit(
  prisma: PrismaClient,
  opts: { tenantId: string; visitId: string; userId: string },
): Promise<{ ok: boolean; reason?: string }> {
  const visit = await prisma.visit.findFirst({
    where: { id: opts.visitId, tenantId: opts.tenantId },
  })
  if (!visit) return { ok: false, reason: 'visit_not_found' }
  if (!visit.projectId) return { ok: false, reason: 'no_project' }

  // 拜访已发生/已录入内容则不再自动生成准备材料（过了准备窗口）
  if (visit.rawInput || visit.audioTranscript || ['IN_PROGRESS', 'REVIEWING', 'CLOSED'].includes(visit.workflowStage)) {
    return { ok: false, reason: 'past_prep_window' }
  }

  const material = await generatePrepMaterial(prisma, {
    tenantId: opts.tenantId,
    projectId: visit.projectId,
    userId: opts.userId,
  })

  const attachments = (visit.attachments as Array<Record<string, unknown>>) || []
  const next = [
    ...attachments.filter((a) => a.type !== 'visit_prep'),
    { type: 'visit_prep', generatedAt: new Date().toISOString(), content: material },
  ]

  const data: Record<string, unknown> = { attachments: next }
  if (['DRAFT', 'PREPARING'].includes(visit.workflowStage)) {
    data.workflowStage = 'READY'
  }
  await prisma.visit.update({ where: { id: visit.id }, data: data as never })

  await refreshClosure(prisma, visit.id, { actorUserId: opts.userId })
  logger.info({ visitId: visit.id, tenantId: opts.tenantId }, 'visit preparation material applied')
  return { ok: true }
}
