import { z } from 'zod'
import type { SkillDefinition } from '../skill-types.js'

const VisitActionInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    projectId: z.string().min(1),
    summary: z.string().min(1),
    visitType: z.enum(['online', 'offline', 'phone']).optional(),
  }),
  z.object({
    action: z.literal('quickRecord'),
    projectId: z.string().optional(),
    companyName: z.string().optional(),
    summary: z.string().min(1),
  }),
])

const VisitActionOutputSchema = z.record(z.unknown())

export const visitActionSkill: SkillDefinition<
  z.infer<typeof VisitActionInputSchema>,
  z.infer<typeof VisitActionOutputSchema>
> = {
  id: 'visit-action',
  name: '拜访操作',
  description: '为商机创建拜访记录或快速记录一次拜访',
  category: 'action',
  readOnly: false,
  inputSchema: VisitActionInputSchema,
  outputSchema: VisitActionOutputSchema,
  execute: async ({ params, context }) => {
    const p = context.prisma
    const tenantId = context.tenantId
    const userId = context.userId

    let projectId = params.action === 'create' ? params.projectId : params.projectId

    if (params.action === 'quickRecord' && !projectId && params.companyName) {
      const project = await p.project.findFirst({
        where: {
          tenantId,
          OR: [
            { name: { contains: params.companyName, mode: 'insensitive' } },
            { company: { name: { contains: params.companyName, mode: 'insensitive' } } },
          ],
        },
        select: { id: true },
      })
      if (project) projectId = project.id
    }

    const visit = await p.visit.create({
      data: {
        projectId,
        visitTime: new Date(),
        visitType: params.action === 'create' ? params.visitType || 'offline' : 'offline',
        summary: params.summary,
        ownerId: userId,
        tenantId,
      } as never,
    })

    if (projectId) {
      await p.project.update({
        where: { id: projectId },
        data: { lastVisitTime: visit.visitTime },
      })
    }

    return { success: true, data: { action: params.action, visit } }
  },
}
