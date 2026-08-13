import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'
import type { SkillDefinition } from '../skill-types.js'

const ProjectQueryInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('search'),
    keyword: z.string().optional(),
    milestone: z.number().int().min(0).max(8).optional(),
    status: z.enum(['ACTIVE', 'CLOSED', 'SUSPENDED']).optional(),
  }),
  z.object({
    action: z.literal('detail'),
    projectId: z.string().min(1).optional(),
    keyword: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal('health'),
    projectId: z.string().min(1).optional(),
    keyword: z.string().min(1).optional(),
  }),
])

const ProjectQueryOutputSchema = z.record(z.unknown())

/** 实体解析：projectId 直取；否则按 keyword 搜（商机名/客户名模糊匹配），取最近更新的一条 */
async function resolveProjectId(
  p: PrismaClient,
  params: { projectId?: string; keyword?: string },
): Promise<string | null> {
  if (params.projectId) return params.projectId
  if (!params.keyword) return null
  const found = await p.project.findFirst({
    where: {
      OR: [
        { name: { contains: params.keyword, mode: 'insensitive' } },
        { company: { name: { contains: params.keyword, mode: 'insensitive' } } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  return found?.id ?? null
}

export const projectQuerySkill: SkillDefinition<
  z.infer<typeof ProjectQueryInputSchema>,
  z.infer<typeof ProjectQueryOutputSchema>
> = {
  id: 'project-query',
  name: '商机查询',
  description: '查询当前租户的商机项目，支持关键词搜索、详情查询、健康度分析',
  category: 'query',
  readOnly: true,
  inputSchema: ProjectQueryInputSchema,
  outputSchema: ProjectQueryOutputSchema,
  execute: async ({ params, context }) => {
    const p = context.prisma

    if (params.action === 'search') {
      const where: Record<string, unknown> = {}
      if (params.keyword) {
        where.OR = [
          { name: { contains: params.keyword, mode: 'insensitive' } },
          { company: { name: { contains: params.keyword, mode: 'insensitive' } } },
        ]
      }
      if (params.milestone != null) where.milestone = params.milestone
      if (params.status) where.status = params.status
      const results = await p.project.findMany({
        where,
        take: 10,
        orderBy: { updatedAt: 'desc' },
        include: { company: { select: { name: true } } },
      })
      return { success: true, data: { action: 'search', count: results.length, projects: results } }
    }

    if (params.action === 'detail') {
      const projectId = await resolveProjectId(p, params)
      if (!projectId) {
        return { success: false, error: { code: 'NOT_FOUND', message: `未找到匹配的商机（keyword=${params.keyword ?? ''}）` } }
      }
      const project = await p.project.findUnique({
        where: { id: projectId },
        include: {
          company: true,
          contacts: { include: { contact: true } },
          visits: { take: 3, orderBy: { visitTime: 'desc' } },
          tasks: { where: { status: { not: 'COMPLETED' } }, take: 5 },
        },
      })
      if (!project) {
        return { success: false, error: { code: 'NOT_FOUND', message: '项目不存在' } }
      }
      return { success: true, data: { action: 'detail', project } }
    }

    // health
    const projectId = await resolveProjectId(p, params)
    if (!projectId) {
      return { success: false, error: { code: 'NOT_FOUND', message: `未找到匹配的商机（keyword=${params.keyword ?? ''}）` } }
    }
    const project = await p.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        healthScore: true,
        healthRadar: true,
        healthHistory: true,
        milestone: true,
        urgency: true,
        isStale: true,
        staleSince: true,
        nextFollowUp: true,
        lastVisitTime: true,
      },
    })
    if (!project) {
      return { success: false, error: { code: 'NOT_FOUND', message: '项目不存在' } }
    }
    const radar = (project.healthRadar as Record<string, number>) || {}
    return {
      success: true,
      data: {
        action: 'health',
        projectId: project.id,
        name: project.name,
        overallScore: project.healthScore,
        milestone: project.milestone,
        urgency: project.urgency,
        isStale: project.isStale,
        staleSince: project.staleSince,
        nextFollowUp: project.nextFollowUp,
        lastVisitTime: project.lastVisitTime,
        radar: {
          informationCompleteness: radar.informationCompleteness ?? 0,
          milestoneProgress: radar.milestoneProgress ?? 0,
          decisionChainClarity: radar.decisionChainClarity ?? 0,
          visitFrequency: radar.visitFrequency ?? 0,
          competitivePosition: radar.competitivePosition ?? 0,
        },
        history: (project.healthHistory as Array<{ date: string; score: number }>) || [],
      },
    }
  },
}
