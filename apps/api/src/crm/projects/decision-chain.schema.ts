import { z } from 'zod'

export const DecisionNodeAttitudeSchema = z.enum([
  'supportive',
  'neutral',
  'opposed',
  'unknown',
])

export const DecisionNodeRoleSchema = z.enum([
  'COACH',
  'EVALUATOR',
  'DECISION_MAKER',
  'USER',
  'INFLUENCER',
  'GATEKEEPER',
  'OTHER',
])

export const DecisionRelationTypeSchema = z.enum([
  'reports_to',
  'influences',
  'collaborates',
  'opposes',
  'unknown',
])

export const DecisionNodeSchema = z.object({
  id: z.string().min(1),
  contactId: z.string().optional(),
  name: z.string().min(1),
  role: z.union([DecisionNodeRoleSchema, z.string()]),
  attitude: z.union([DecisionNodeAttitudeSchema, z.string()]).default('unknown'),
  influence: z.number().min(0).max(100).optional(),
  weight: z.number().min(0).max(100).optional(),
  title: z.string().nullish(),
  department: z.string().nullish(),
  contactInfo: z.object({
    phone: z.string().nullish(),
    email: z.string().nullish(),
  }).optional(),
  insights: z.array(z.string()).optional(),
})

export const DecisionRelationSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  relation: z.union([DecisionRelationTypeSchema, z.string()]).default('unknown'),
})

export const DecisionMapSchema = z.object({
  nodes: z.array(DecisionNodeSchema).default([]),
  relations: z.array(DecisionRelationSchema).default([]),
})

export const UpdateDecisionMapSchema = DecisionMapSchema

export type DecisionNodeInput = z.infer<typeof DecisionNodeSchema>
export type DecisionRelationInput = z.infer<typeof DecisionRelationSchema>
export type DecisionMapInput = z.infer<typeof DecisionMapSchema>
