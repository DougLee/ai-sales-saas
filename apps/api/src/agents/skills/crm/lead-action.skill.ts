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
    // 同名去重：租户内已存在同名公司则直接复用，避免重复入库产生垃圾
    const existing = await p.company.findFirst({
      where: { name: params.name, tenantId: context.tenantId },
    })
    if (existing) {
      return { success: true, data: { company: existing, reused: true } }
    }
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
    return { success: true, data: { company, reused: false } }
  },
}
