import { z } from 'zod'

export const UserRoleSchema = z.enum(['SUPER_ADMIN', 'TENANT_ADMIN', 'DEPT_HEAD', 'SALES', 'VIEWER'])

export const LeadSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),
  name: z.string().min(1),
  industry: z.string().default('education'),
  status: z.enum(['ACTIVE', 'CONVERTED', 'LOST', 'PAUSED']).default('ACTIVE'),
  source: z.string().default('cold_call'),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactPosition: z.string().optional(),
  contactEmail: z.string().optional(),
  completenessScore: z.number().int().min(0).max(100).default(0),
  notes: z.string().optional(),
})

export const ProjectSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),
  companyId: z.string().optional(),
  name: z.string().min(1),
  industry: z.string().default('education'),
  amount: z.number().optional(),
  milestone: z.number().int().min(0).max(7).default(0),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  healthScore: z.number().int().min(0).max(100).optional(),
})

export const VisitSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  projectId: z.string(),
  ownerId: z.string(),
  visitTime: z.date(),
  visitType: z.enum(['online', 'offline', 'phone']),
  sceneType: z.string().optional(),
  summary: z.string().optional(),
  audioUrl: z.string().optional(),
  audioTranscript: z.string().optional(),
})
