import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'

/**
 * 任务实体写入服务（《智能体数据写入治理规范》§一：单一写入通道）
 *
 * 铁律：任何代码路径（人工表单 / 智能体工作流 / 定时任务）创建任务必须走这里，
 * 禁止绕过服务层直调 prisma.task.create。
 */

export const CreateTaskSchema = z.object({
  tenantId: z.string().min(1),
  ownerId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  orgId: z.string().nullish(),
  companyId: z.string().nullish(),
  projectId: z.string().nullish(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  source: z.string().optional(), // 'manual' | 'visit_analysis' | 'ai_visit_extraction' | ...
  sourceId: z.string().optional(),
  deadline: z.coerce.date().optional(),
})

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>

/**
 * 创建任务（人工录入与智能体提取共用）
 *
 * 注意：AI 从拜访中提取的任务在 Phase 3 起不再直接调用本服务，
 * 而是先入 AiPendingItem 待确认队列，人工确认后由 confirmations 接口调本服务落库。
 */
export async function createTask(prisma: PrismaClient, rawInput: CreateTaskInput) {
  // 1. 契约校验（表单与智能体同一份 Schema）
  const input = CreateTaskSchema.parse(rawInput)

  // 2. 关联存在性校验
  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, tenantId: input.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!project) throw new Error(`任务关联的商机不存在: ${input.projectId}`)
  }
  if (input.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.companyId, tenantId: input.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!company) throw new Error(`任务关联的客户不存在: ${input.companyId}`)
  }

  // 3. 落库
  return prisma.task.create({
    data: {
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      orgId: input.orgId ?? null,
      companyId: input.companyId ?? null,
      projectId: input.projectId ?? null,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: 'PENDING',
      source: input.source,
      sourceId: input.sourceId,
      deadline: input.deadline,
    },
  })
}
