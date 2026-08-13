import { z } from 'zod'
import type { SkillDefinition } from '../skill-types.js'

const CustomerAggregateInputSchema = z.object({
  customerId: z.string().min(1).describe('客户（公司）ID'),
})

const CustomerAggregateOutputSchema = z.record(z.unknown())

export const customerAggregateSkill: SkillDefinition<
  z.infer<typeof CustomerAggregateInputSchema>,
  z.infer<typeof CustomerAggregateOutputSchema>
> = {
  id: 'customer-aggregate',
  name: '客户全景聚合查询',
  description:
    '根据 customerId 聚合查询客户、线索、商机、拜访、任务、联系人，作为客户维度问答的首选数据源',
  category: 'query',
  readOnly: true,
  inputSchema: CustomerAggregateInputSchema,
  outputSchema: CustomerAggregateOutputSchema,
  execute: async ({ params, context }) => {
    const p = context.prisma
    const { customerId } = params

    const company = await p.company.findUnique({
      where: { id: customerId },
      include: { owner: { select: { id: true, name: true } } },
    })
    if (!company) {
      return { success: true, data: { found: false, customerId } }
    }

    const [leads, projects, visits, tasks, contacts] = await Promise.all([
      p.lead.findMany({
        where: { companyId: customerId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      p.project.findMany({
        where: { companyId: customerId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: {
          contacts: {
            include: { contact: { select: { id: true, name: true, decisionRole: true } } },
          },
        },
      }),
      p.visit.findMany({
        where: { companyId: customerId },
        orderBy: { visitTime: 'desc' },
        take: 20,
        include: { project: { select: { id: true, name: true } } },
      }),
      p.task.findMany({
        where: { companyId: customerId, status: { not: 'COMPLETED' } },
        orderBy: { deadline: 'asc' },
        take: 20,
      }),
      p.contact.findMany({
        where: { companyId: customerId },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ])

    return {
      success: true,
      data: {
        found: true,
        company: {
          ...company,
          statusLabel: statusToLabel(company.status),
        },
        leads,
        projects,
        visits,
        tasks,
        contacts,
        summary: {
          leadCount: leads.length,
          projectCount: projects.length,
          visitCount: visits.length,
          pendingTaskCount: tasks.length,
          contactCount: contacts.length,
        },
      },
    }
  },
}

function statusToLabel(status: string): string {
  const map: Record<string, string> = {
    target: '目标客户',
    following: '在跟进客户',
    won: '成交客户',
    lost: '流失客户',
  }
  return map[status] || status
}
