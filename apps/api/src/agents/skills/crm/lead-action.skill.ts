import { z } from 'zod'
import type { SkillDefinition } from '../skill-types.js'

const LeadActionInputSchema = z.object({
  name: z.string().min(1).describe('目标客户名称（学校/公司名）'),
  industry: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
})

const LeadActionOutputSchema = z.record(z.unknown())

export const leadActionSkill: SkillDefinition<
  z.infer<typeof LeadActionInputSchema>,
  z.infer<typeof LeadActionOutputSchema>
> = {
  id: 'lead-action',
  name: '目标客户创建',
  description: '从对话中创建一条目标客户（落入公海池，可信度为中，需销售核实）',
  category: 'action',
  readOnly: false,
  inputSchema: LeadActionInputSchema,
  outputSchema: LeadActionOutputSchema,
  execute: async ({ params, context }) => {
    const p = context.prisma
    const company = await p.company.create({
      data: {
        name: params.name,
        industry: params.industry || 'education',
        contactPerson: params.contactName,
        contactPhone: params.contactPhone,
        notes: params.notes,
        status: 'target',
        dataConfidence: 'medium',
        source: 'ai_recommendation',
        tenantId: context.tenantId,
      } as never,
    })
    return { success: true, data: { company } }
  },
}
