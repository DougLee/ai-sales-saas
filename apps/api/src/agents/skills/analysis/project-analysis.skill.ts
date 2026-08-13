import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { validateMilestoneAdvance, loadMilestoneGates } from '../../../milestone-gate/index.js'
import type { SkillDefinition } from '../skill-types.js'

const ProjectAnalysisInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('structuredLedger'),
    projectId: z.string().min(1),
    summary: z.string().min(1),
    cognitivePayload: z
      .object({
        perceivedIntent: z.string().optional(),
        hiddenObjection: z.string().optional().nullable(),
        confidence: z.union([z.number().min(0).max(1), z.string()]).optional(),
      })
      .optional(),
    mutations: z
      .object({
        milestone: z.union([z.number().int().min(0).max(8), z.string()]).optional(),
        healthScore: z.union([z.number().int().min(0).max(100), z.string()]).optional(),
        winProbability: z.union([z.number().int().min(0).max(100), z.string()]).optional(),
      })
      .optional(),
    evidenceSegment: z.string().min(1),
  }),
  z.object({
    action: z.literal('raiseRiskAndPlanNBA'),
    projectId: z.string().min(1).optional(),
    missingDimension: z.enum(['HUMAN', 'BUSINESS', 'FINANCE']),
    diagnosticRisk: z.string().min(1),
    nextBestActionPrompt: z.string().min(1),
    suggestedDeadline: z.string().optional(),
  }),
])

const ProjectAnalysisOutputSchema = z.record(z.unknown())

export const projectAnalysisSkill: SkillDefinition<
  z.infer<typeof ProjectAnalysisInputSchema>,
  z.infer<typeof ProjectAnalysisOutputSchema>
> = {
  id: 'project-analysis',
  name: '项目分析',
  description: '对商机项目进行认知审计、里程碑 gate 校验、风险识别和下一步最佳行动（NBA）规划',
  category: 'analysis',
  readOnly: false,
  inputSchema: ProjectAnalysisInputSchema,
  outputSchema: ProjectAnalysisOutputSchema,
  execute: async ({ params, context }) => {
    const prisma = context.prisma
    const tenantId = context.tenantId
    const userId = context.userId
    const orgId = context.orgId || ''
    const now = new Date()

    if (params.action === 'structuredLedger') {
      const normalizedMutations: Record<string, unknown> = {}
      if (params.mutations) {
        if (params.mutations.milestone != null) {
          normalizedMutations.milestone = Number(params.mutations.milestone)
        }
        if (params.mutations.healthScore != null) {
          normalizedMutations.healthScore = Number(params.mutations.healthScore)
        }
        if (params.mutations.winProbability != null) {
          normalizedMutations.winProbability = Number(params.mutations.winProbability)
        }
      }

      const normalizedCognitive: Record<string, unknown> = {}
      if (params.cognitivePayload) {
        if (params.cognitivePayload.perceivedIntent != null) {
          normalizedCognitive.perceivedIntent = params.cognitivePayload.perceivedIntent
        }
        if (params.cognitivePayload.hiddenObjection != null) {
          normalizedCognitive.hiddenObjection = params.cognitivePayload.hiddenObjection
        }
        if (params.cognitivePayload.confidence != null) {
          normalizedCognitive.confidence = Number(params.cognitivePayload.confidence)
        }
      }

      let customerId = ''
      let resolvedOrgId = orgId
      let projectOwnerId = userId
      let currentMilestone = 0
      const project = await prisma.project.findUnique({
        where: { id: params.projectId },
        select: {
          companyId: true,
          ownerId: true,
          milestone: true,
          owner: { select: { orgId: true } },
        },
      })
      if (project) {
        customerId = project.companyId || ''
        currentMilestone = project.milestone ?? 0
        if (project.ownerId) projectOwnerId = project.ownerId
        if (!resolvedOrgId && project.owner?.orgId) resolvedOrgId = project.owner.orgId
      }

      // 里程碑推进 gate 校验
      const targetMilestone = normalizedMutations.milestone != null ? Number(normalizedMutations.milestone) : null
      if (targetMilestone != null && targetMilestone > currentMilestone) {
        const gates = await loadMilestoneGates(prisma, tenantId)
        const gateResult = await validateMilestoneAdvance(
          prisma,
          params.projectId,
          currentMilestone,
          targetMilestone,
          gates,
        )

        if (!gateResult.passed) {
          const missingLabels = gateResult.missing.map((m) => m.label).join('、')
          const timelineEvent = await prisma.timelineEvent.create({
            data: {
              tenantId,
              ownerId: userId,
              orgId: resolvedOrgId,
              customerId,
              customerType: 'company',
              projectId: params.projectId,
              eventType: 'agent.audit',
              eventSubtype: 'milestone.gate_blocked',
              eventData: {
                source: 'sales_voice_audit',
                attemptedMilestone: targetMilestone,
                currentMilestone,
                missingFields: gateResult.missing,
              },
              cognitivePayload: {
                perceivedIntent: 'AI尝试推进里程碑但被gate阻断',
                confidence: 0.9,
              } as unknown as Prisma.InputJsonValue,
              aiInsight: `AI审计尝试将里程碑从 M${currentMilestone} 推进到 M${targetMilestone}，但条件不满足：${missingLabels}`,
              sourceType: 'sales_voice',
              sourceLabel: 'AI认知审计 - Gate阻断',
              eventTime: now,
            },
          })

          await prisma.task.create({
            data: {
              tenantId,
              ownerId: projectOwnerId,
              orgId: resolvedOrgId,
              projectId: params.projectId,
              title: `补齐里程碑推进条件（M${currentMilestone} → M${targetMilestone}）`,
              description: `AI检测到商机可以尝试推进到 M${targetMilestone}，但以下条件尚未满足：\n${gateResult.missing
                .map((m) => `- ${m.label}${m.path ? ` (${m.path})` : ''}`)
                .join('\n')}\n\n请补充相关信息后再尝试推进。`,
              priority: 'HIGH',
              status: 'PENDING',
              source: 'agent_gate_blocked',
              sourceId: timelineEvent.id,
            },
          })

          return {
            success: false,
            error: {
              code: 'GATE_BLOCKED',
              message: `里程碑推进被阻断：${missingLabels} 尚未录入`,
            },
            data: {
              timelineEventId: timelineEvent.id,
              projectId: params.projectId,
              appliedMutations: {},
              gateBlocked: true,
              missingFields: gateResult.missing,
            },
          }
        }
      }

      // 创建 TimelineEvent
      const timelineEvent = await prisma.timelineEvent.create({
        data: {
          tenantId,
          ownerId: userId,
          orgId: resolvedOrgId,
          customerId,
          customerType: 'company',
          projectId: params.projectId,
          eventType: 'agent.audit',
          eventSubtype: 'project.structured_ledger',
          eventData: { source: 'sales_voice_audit' },
          cognitivePayload: normalizedCognitive as unknown as Prisma.InputJsonValue,
          mutations: normalizedMutations as unknown as Prisma.InputJsonValue,
          aiInsight: params.summary,
          sourceType: 'sales_voice',
          sourceLabel: 'AI认知审计',
          eventTime: now,
        },
      })

      // 投影到 Project
      const projectUpdates: Record<string, unknown> = { updatedAt: now }
      if (normalizedMutations.milestone != null) {
        projectUpdates.milestone = normalizedMutations.milestone
        const currentProject = await prisma.project.findUnique({
          where: { id: params.projectId },
          select: { milestoneHistory: true },
        })
        const history = (currentProject?.milestoneHistory as Array<{ milestone: number; at: string }>) || []
        history.push({ milestone: normalizedMutations.milestone as number, at: now.toISOString() })
        projectUpdates.milestoneHistory = history
      }
      if (normalizedMutations.healthScore != null) {
        projectUpdates.healthScore = normalizedMutations.healthScore
      }
      if (normalizedMutations.winProbability != null) {
        projectUpdates.winProbability = normalizedMutations.winProbability
      }

      const currentProject = await prisma.project.findUnique({
        where: { id: params.projectId },
        select: { evidenceChain: true },
      })
      const evidenceChain = (currentProject?.evidenceChain as Array<{
        milestone?: number
        verifiedAt: string
        timelineEventId: string
        evidenceSegment: string
      }>) || []
      evidenceChain.push({
        milestone: normalizedMutations.milestone as number | undefined,
        verifiedAt: now.toISOString(),
        timelineEventId: timelineEvent.id,
        evidenceSegment: params.evidenceSegment,
      })
      projectUpdates.evidenceChain = evidenceChain

      await prisma.project.update({
        where: { id: params.projectId },
        data: projectUpdates,
      })

      return {
        success: true,
        data: {
          timelineEventId: timelineEvent.id,
          projectId: params.projectId,
          appliedMutations: params.mutations ?? {},
        },
      }
    }

    // raiseRiskAndPlanNBA
    const dimensionLabel = {
      HUMAN: '人（决策链）',
      BUSINESS: '事（需求/方案）',
      FINANCE: '财（预算/审批）',
    }[params.missingDimension]

    let customerId = ''
    let resolvedOrgId = orgId
    if (params.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: params.projectId },
        select: { companyId: true, owner: { select: { orgId: true } } },
      })
      if (project) {
        customerId = project.companyId || ''
        if (!resolvedOrgId && project.owner?.orgId) resolvedOrgId = project.owner.orgId
      }
    }

    const timelineEvent = await prisma.timelineEvent.create({
      data: {
        tenantId,
        ownerId: userId,
        orgId: resolvedOrgId,
        customerId,
        customerType: 'company',
        projectId: params.projectId ?? null,
        eventType: 'agent.nba',
        eventSubtype: 'gap.filling',
        eventData: {
          missingDimension: params.missingDimension,
          diagnosticRisk: params.diagnosticRisk,
        },
        cognitivePayload: {
          perceivedIntent: '信息缺失需补救',
          missingDimension: params.missingDimension,
          confidence: 0.85,
        },
        aiInsight: `缺失${dimensionLabel}：${params.diagnosticRisk}。建议：${params.nextBestActionPrompt}`,
        sourceType: 'agent_audit',
        sourceLabel: 'AI错漏补救教练',
        eventTime: now,
      },
    })

    const deadline = params.suggestedDeadline ? new Date(params.suggestedDeadline) : undefined
    const task = await prisma.task.create({
      data: {
        tenantId,
        ownerId: userId,
        projectId: params.projectId ?? null,
        title: `补齐${dimensionLabel}信息`,
        description: `${params.diagnosticRisk}\n\n建议话术：${params.nextBestActionPrompt}`,
        priority: 'HIGH',
        status: 'PENDING',
        source: 'agent_nba',
        sourceId: timelineEvent.id,
        deadline,
      },
    })

    return {
      success: true,
      data: {
        timelineEventId: timelineEvent.id,
        taskId: task.id,
        missingDimension: params.missingDimension,
        message: `已创建补救任务：${task.title}`,
      },
    }
  },
}
