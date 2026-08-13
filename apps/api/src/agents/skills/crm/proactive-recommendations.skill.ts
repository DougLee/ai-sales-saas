import { z } from 'zod'
import type { SkillDefinition } from '../skill-types.js'

const ProactiveRecommendationsInputSchema = z.object({
  userId: z.string().optional().describe('若指定则仅返回该用户的推荐'),
})

const ProactiveRecommendationsOutputSchema = z.record(z.unknown())

export const proactiveRecommendationsSkill: SkillDefinition<
  z.infer<typeof ProactiveRecommendationsInputSchema>,
  z.infer<typeof ProactiveRecommendationsOutputSchema>
> = {
  id: 'proactive-recommendations',
  name: '每日推荐行动',
  description: '基于最近拜访、项目状态、任务Deadline生成今日推荐行动清单',
  category: 'analysis',
  readOnly: true,
  inputSchema: ProactiveRecommendationsInputSchema,
  outputSchema: ProactiveRecommendationsOutputSchema,
  execute: async ({ params, context }) => {
    const p = context.prisma
    const tenantId = context.tenantId
    const now = new Date()
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const ownerWhere = params.userId ? { ownerId: params.userId } : {}

    const [staleProjects, overdueTasks, coldFollowingCompanies, lowScoreLeads] = await Promise.all([
      // 14 天内无拜访的活跃商机
      p.project.findMany({
        where: {
          tenantId,
          deletedAt: null,
          closedAt: null,
          status: { not: 'won' },
          ...ownerWhere,
          OR: [
            { lastVisitTime: { lt: fourteenDaysAgo } },
            { lastVisitTime: null },
          ],
        },
        include: { company: { select: { id: true, name: true } } },
        take: 20,
        orderBy: { lastVisitTime: { sort: 'asc', nulls: 'first' } },
      }),

      // 逾期待办
      p.task.findMany({
        where: {
          tenantId,
          status: { not: 'COMPLETED' },
          deadline: { lt: now },
          ...ownerWhere,
        },
        include: { company: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
        take: 20,
        orderBy: { deadline: 'asc' },
      }),

      // 30 天无拜访的在跟进客户
      p.company.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: 'following',
          ...ownerWhere,
          OR: [
            { updatedAt: { lt: thirtyDaysAgo } },
            { visits: { none: { visitTime: { gt: thirtyDaysAgo } } } },
          ],
        },
        take: 20,
        orderBy: { updatedAt: 'asc' },
      }),

      // 低评分线索且 7 天未跟进
      p.lead.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: 'FOLLOWING',
          ...ownerWhere,
          score: { lt: 40 },
          OR: [
            { lastFollowUpAt: { lt: sevenDaysAgo } },
            { lastFollowUpAt: null },
          ],
        },
        include: { company: { select: { id: true, name: true } } },
        take: 20,
        orderBy: { lastFollowUpAt: { sort: 'asc', nulls: 'first' } },
      }),
    ])

    const recommendations = [
      ...staleProjects.map((p) => ({
        type: 'stale_project',
        priority: 'high',
        title: `商机「${p.name}」超过14天无拜访`,
        entityType: 'project',
        entityId: p.id,
        companyId: p.companyId,
        companyName: p.company?.name,
        action: '安排拜访或电话跟进',
      })),
      ...overdueTasks.map((t) => ({
        type: 'overdue_task',
        priority: 'high',
        title: `待办「${t.title}」已逾期`,
        entityType: 'task',
        entityId: t.id,
        companyId: t.companyId,
        companyName: t.company?.name,
        projectId: t.projectId,
        projectName: t.project?.name,
        action: '尽快处理或调整截止时间',
      })),
      ...coldFollowingCompanies.map((c) => ({
        type: 'cold_company',
        priority: 'medium',
        title: `客户「${c.name}」超过30天无互动`,
        entityType: 'customer',
        entityId: c.id,
        companyId: c.id,
        companyName: c.name,
        action: '发起一次拜访或电话触达',
      })),
      ...lowScoreLeads.map((l) => ({
        type: 'low_score_lead',
        priority: 'medium',
        title: `线索「${l.name}」评分较低且未跟进`,
        entityType: 'lead',
        entityId: l.id,
        companyId: l.companyId,
        companyName: l.company?.name,
        action: '补充信息或推进转化',
      })),
    ].sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1))

    return {
      success: true,
      data: {
        count: recommendations.length,
        recommendations: recommendations.slice(0, 20),
      },
    }
  },
}
