import { z } from 'zod'
import { isValidPhone, isValidEmail, PHONE_ERROR_MESSAGE, EMAIL_ERROR_MESSAGE } from '@ai-sales/shared'

export const LeadSourceEnum = z.enum([
  'cold_call',
  'referral',
  'exhibition',
  'online',
  'official_website',
  'partner',
  'other',
])

export const LeadStatusEnum = z.enum(['NEW', 'FOLLOWING', 'CONVERTED', 'LOST', 'PAUSED'])

export const LeadChannelEnum = z.enum(['phone', 'wechat', 'email', 'visit', 'other'])

export const HumanInfoSchema = z.object({
  decisionMaker: z.string().optional(),
  decisionChain: z.string().optional(),
  supporter: z.string().optional(),
  opponent: z.string().optional(),
}).default({})

export const BusinessInfoSchema = z.object({
  requirements: z.string().optional(),
  timeline: z.string().optional(),
  painPoints: z.string().optional(),
  expectedOutcome: z.string().optional(),
}).default({})

export const FinanceInfoSchema = z.object({
  budget: z.string().optional(),
  budgetSource: z.string().optional(),
  approvalProcess: z.string().optional(),
}).default({})

export const CreateLeadSchema = z.object({
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  visitId: z.string().optional(),
  name: z.string().min(1),
  industry: z.string().default('education'),
  status: LeadStatusEnum.default('FOLLOWING'),
  source: LeadSourceEnum.default('cold_call'),
  contactName: z.string().optional(),
  contactPhone: z.string().optional().refine(isValidPhone, { message: PHONE_ERROR_MESSAGE }),
  contactPosition: z.string().optional(),
  contactEmail: z.string().optional().refine(isValidEmail, { message: EMAIL_ERROR_MESSAGE }),
  notes: z.string().optional(),
  humanInfo: HumanInfoSchema,
  businessInfo: BusinessInfoSchema,
  financeInfo: FinanceInfoSchema,
})

export const UpdateLeadSchema = CreateLeadSchema.partial()

export const FollowUpSchema = z.object({
  content: z.string().min(1),
  channel: LeadChannelEnum.default('other'),
  outcome: z.string().optional(),
  nextAction: z.string().optional(),
  nextActionDeadline: z.string().datetime().optional(),
})

export const ConvertSchema = z.object({
  force: z.boolean().optional(),
  forceReason: z.string().optional(),
})

export const LoseSchema = z.object({
  lostReason: z.string().min(1),
})

export const ListLeadsQuerySchema = z.object({
  status: LeadStatusEnum.optional(),
  grade: z.enum(['A', 'B', 'C']).optional(),
  search: z.string().optional(),
  page: z.string().transform(Number).default('1'),
  pageSize: z.string().transform(Number).default('20'),
})

export type CreateLeadInput = z.infer<typeof CreateLeadSchema>
export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>
export type FollowUpInput = z.infer<typeof FollowUpSchema>
export type ConvertInput = z.infer<typeof ConvertSchema>
export type LoseInput = z.infer<typeof LoseSchema>
