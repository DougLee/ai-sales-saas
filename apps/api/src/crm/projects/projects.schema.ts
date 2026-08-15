import { z } from 'zod'

export const ProjectStatusEnum = z.enum(['following', 'stale', 'won', 'lost'])

export const CreateProjectSchema = z.object({
  name: z.string().min(1),
  companyId: z.string().min(1),
  sourceLeadId: z.string().optional(),
  industry: z.string().default('education'),
  amount: z.number().optional(),
  status: ProjectStatusEnum.default('following'),
  milestone: z.number().int().min(0).max(8).default(0),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  humanInfo: z.record(z.unknown()).optional(),
  businessInfo: z.record(z.unknown()).optional(),
  financeInfo: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  healthScore: z.number().int().min(0).max(100).optional(),
  nextFollowUp: z.union([z.string().datetime(), z.date()]).optional(),
  closedAt: z.union([z.string().datetime(), z.date()]).optional(),
  lostInfo: z.record(z.unknown()).optional(),
})

export const UpdateProjectSchema = CreateProjectSchema.partial().extend({
  /** ADR-0004 决策 4：里程碑回退原因（回退时必填） */
  backReason: z.string().min(1).optional(),
  /**
   * P0-2：M6/M7 门禁字段打通——gate 读 project.decisionMap.nodes / evidence.bidResult，
   * PUT /projects/:id 此前没有这两个字段的入口，后两级里程碑成了断头路。
   * （gate-field 接口直接走 prisma 写 evidence._gateFieldSource，不经此 schema，不受影响）
   */
  decisionMap: z.record(z.unknown()).optional(),
  evidence: z.record(z.unknown()).optional(),
})

export const ListProjectsQuerySchema = z.object({
  milestone: z.string().transform(Number).optional(),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  search: z.string().optional(),
  page: z.string().transform(Number).default('1'),
  pageSize: z.string().transform(Number).default('20'),
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
