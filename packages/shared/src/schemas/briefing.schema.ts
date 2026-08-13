import { z } from 'zod'

export const PriorityActionSchema = z.object({
  id: z.string(),
  rank: z.number().min(1).max(3),
  title: z.string(),
  entityType: z.enum(['project', 'lead', 'visit', 'task']),
  entityId: z.string(),
  entityName: z.string(),
  reason: z.string(),
  suggestedAction: z.string(),
  path: z.string(),
  canExecute: z.boolean(),
  executeTool: z.string().optional(),
})

export const BriefingInsightSchema = z.object({
  type: z.enum(['opportunity', 'risk', 'pattern']),
  title: z.string(),
  description: z.string(),
  evidence: z.array(z.string()),
})

export const BriefingStatsSchema = z.object({
  newLeadsThisWeek: z.number(),
  activeProjects: z.number(),
  staleProjects: z.number(),
  avgHealthScore: z.number(),
})

export const BriefingSchema = z.object({
  date: z.string(),
  priorityActions: z.array(PriorityActionSchema),
  insight: BriefingInsightSchema,
  stats: BriefingStatsSchema,
})

export type PriorityAction = z.infer<typeof PriorityActionSchema>
export type BriefingInsight = z.infer<typeof BriefingInsightSchema>
export type BriefingStats = z.infer<typeof BriefingStatsSchema>
export type Briefing = z.infer<typeof BriefingSchema>
