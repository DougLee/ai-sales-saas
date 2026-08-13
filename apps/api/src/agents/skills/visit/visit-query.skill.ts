import { z } from 'zod'
import type { SkillDefinition } from '../skill-types.js'

const VisitQueryInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('search'),
    keyword: z.string().optional(),
    projectId: z.string().optional(),
  }),
  z.object({
    action: z.literal('detail'),
    visitId: z.string().min(1),
  }),
])

const VisitQueryOutputSchema = z.record(z.unknown())

export const visitQuerySkill: SkillDefinition<
  z.infer<typeof VisitQueryInputSchema>,
  z.infer<typeof VisitQueryOutputSchema>
> = {
  id: 'visit-query',
  name: '拜访查询',
  description: '查询当前租户的拜访记录',
  category: 'query',
  readOnly: true,
  inputSchema: VisitQueryInputSchema,
  outputSchema: VisitQueryOutputSchema,
  execute: async ({ params, context }) => {
    const prisma = context.prisma

    if (params.action === 'search') {
      const where: Record<string, unknown> = {}
      if (params.projectId) where.projectId = params.projectId
      if (params.keyword) {
        where.OR = [
          { summary: { contains: params.keyword, mode: 'insensitive' } },
          { audioTranscript: { contains: params.keyword, mode: 'insensitive' } },
        ]
      }
      const visits = await prisma.visit.findMany({
        where,
        take: 10,
        orderBy: { visitTime: 'desc' },
        include: { project: { select: { name: true } } },
      })
      return { success: true, data: { action: 'search', count: visits.length, visits } }
    }

    const visit = await prisma.visit.findUnique({
      where: { id: params.visitId },
      include: {
        project: {
          include: {
            company: true,
            contacts: { include: { contact: true } },
            visits: { take: 5, orderBy: { visitTime: 'desc' } },
          },
        },
      },
    })
    return { success: true, data: { action: 'detail', visit } }
  },
}
