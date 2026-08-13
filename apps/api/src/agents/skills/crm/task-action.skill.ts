import { z } from 'zod'
import type { SkillDefinition } from '../skill-types.js'

const TaskActionInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    deadline: z.string().optional(),
    projectId: z.string().optional(),
  }),
  z.object({
    action: z.literal('setReminder'),
    title: z.string().min(1),
    remindAt: z.string(),
    projectId: z.string().optional(),
  }),
])

const TaskActionOutputSchema = z.record(z.unknown())

export const taskActionSkill: SkillDefinition<
  z.infer<typeof TaskActionInputSchema>,
  z.infer<typeof TaskActionOutputSchema>
> = {
  id: 'task-action',
  name: '任务操作',
  description: '创建任务或设置跟进提醒',
  category: 'action',
  readOnly: false,
  inputSchema: TaskActionInputSchema,
  outputSchema: TaskActionOutputSchema,
  execute: async ({ params, context }) => {
    const p = context.prisma
    const tenantId = context.tenantId
    const userId = context.userId

    if (params.action === 'create') {
      const task = await p.task.create({
        data: {
          title: params.title,
          description: params.description,
          priority: params.priority || 'MEDIUM',
          projectId: params.projectId,
          deadline: params.deadline ? new Date(params.deadline) : undefined,
          status: 'PENDING',
          tenantId,
          ownerId: userId,
          source: 'agent_crm_tool',
        } as never,
      })
      return { success: true, data: { action: 'create', task } }
    }

    const task = await p.task.create({
      data: {
        title: params.title,
        deadline: new Date(params.remindAt),
        priority: 'HIGH',
        status: 'PENDING',
        projectId: params.projectId,
        ownerId: userId,
        tenantId,
        source: 'agent_reminder',
      } as never,
    })
    return { success: true, data: { action: 'setReminder', task } }
  },
}
