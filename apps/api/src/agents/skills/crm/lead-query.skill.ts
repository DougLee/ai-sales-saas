import { z } from 'zod'
import type { SkillDefinition } from '../skill-types.js'

const LeadQueryInputSchema = z.object({
  keyword: z.string().optional(),
})

const LeadQueryOutputSchema = z.record(z.unknown())

export const leadQuerySkill: SkillDefinition<
  z.infer<typeof LeadQueryInputSchema>,
  z.infer<typeof LeadQueryOutputSchema>
> = {
  id: 'lead-query',
  name: '线索查询',
  description: '查询当前租户的线索',
  category: 'query',
  readOnly: true,
  inputSchema: LeadQueryInputSchema,
  outputSchema: LeadQueryOutputSchema,
  execute: async ({ params, context }) => {
    const p = context.prisma
    const where: Record<string, unknown> = {}
    if (params.keyword) {
      where.OR = [
        { name: { contains: params.keyword, mode: 'insensitive' } },
        { contactName: { contains: params.keyword, mode: 'insensitive' } },
      ]
    }
    const results = await p.lead.findMany({
      where,
      take: 10,
      orderBy: { createdAt: 'desc' },
    })
    return { success: true, data: { count: results.length, leads: results } }
  },
}
