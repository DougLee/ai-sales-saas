import { z } from 'zod'
import type { SkillDefinition } from '../skill-types.js'

const CompanyQueryInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('searchCompanies'),
    keyword: z.string().optional(),
  }),
  z.object({
    action: z.literal('searchContacts'),
    keyword: z.string().optional(),
  }),
])

const CompanyQueryOutputSchema = z.record(z.unknown())

export const companyQuerySkill: SkillDefinition<
  z.infer<typeof CompanyQueryInputSchema>,
  z.infer<typeof CompanyQueryOutputSchema>
> = {
  id: 'company-query',
  name: '客户与联系人查询',
  description: '查询当前租户的客户公司和联系人',
  category: 'query',
  readOnly: true,
  inputSchema: CompanyQueryInputSchema,
  outputSchema: CompanyQueryOutputSchema,
  execute: async ({ params, context }) => {
    const p = context.prisma

    if (params.action === 'searchCompanies') {
      const where: Record<string, unknown> = {}
      if (params.keyword) {
        where.OR = [
          { name: { contains: params.keyword, mode: 'insensitive' } },
          { region: { contains: params.keyword, mode: 'insensitive' } },
        ]
      }
      const results = await p.company.findMany({
        where,
        take: 10,
        orderBy: { updatedAt: 'desc' },
      })
      return { success: true, data: { action: 'searchCompanies', count: results.length, companies: results } }
    }

    const where: Record<string, unknown> = {}
    if (params.keyword) {
      where.OR = [
        { name: { contains: params.keyword, mode: 'insensitive' } },
        { phone: { contains: params.keyword } },
        { email: { contains: params.keyword } },
      ]
    }
    const results = await p.contact.findMany({
      where,
      take: 10,
      orderBy: { updatedAt: 'desc' },
    })
    return { success: true, data: { action: 'searchContacts', count: results.length, contacts: results } }
  },
}
