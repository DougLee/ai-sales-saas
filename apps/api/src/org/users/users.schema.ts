import { z } from 'zod'

export const ListUsersQuerySchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'TENANT_ADMIN', 'DEPT_HEAD', 'SALES', 'VIEWER']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const UpdateUserBodySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  role: z.enum(['SUPER_ADMIN', 'TENANT_ADMIN', 'DEPT_HEAD', 'SALES', 'VIEWER']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  orgId: z.string().optional(),
})
