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

export const UpdateProjectSchema = CreateProjectSchema.partial()

export const ListProjectsQuerySchema = z.object({
  milestone: z.string().transform(Number).optional(),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  search: z.string().optional(),
  page: z.string().transform(Number).default('1'),
  pageSize: z.string().transform(Number).default('20'),
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
