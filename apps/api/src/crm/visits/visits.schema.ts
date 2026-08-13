import { z } from 'zod'

/** V6.1 §5.2 节点3：拜访记录三种方式 + 备注，录音非必选 */
export const RAW_INPUT_TYPES = ['transcript', 'recap', 'meeting', 'note'] as const

export const CreateVisitSchema = z.object({
  companyId: z.string().min(1),
  projectId: z.string().optional(),
  leadId: z.string().optional(),
  visitTime: z.string().datetime(),
  visitType: z.enum(['online', 'offline', 'phone']),
  sceneType: z.string().optional(),
  summary: z.string().optional(),
  rawInput: z.string().optional(),
  rawInputType: z.enum(RAW_INPUT_TYPES).optional(),
  audioUrl: z.string().optional(),
  audioTranscript: z.string().optional(),
  consentConfirmed: z.boolean().optional(),
  contactName: z.string().optional(),
  contactPosition: z.string().optional(),
  contactRole: z.string().optional(),
  nextAction: z.string().optional(),
  nextActionDeadline: z.string().datetime().optional(),
})

export const UpdateVisitSchema = CreateVisitSchema.partial()

/**
 * V6.1 节点3：拜访记录录入（logVisit）
 * - rawInput 必填：销售原始记录（评分唯一依据）
 * - rawInputType='transcript'（客户现场录音）时必须 consentConfirmed=true（PIPL 告知同意）
 */
export const LogVisitSchema = z
  .object({
    rawInput: z.string().min(1, '原始记录不能为空'),
    rawInputType: z.enum(RAW_INPUT_TYPES),
    audioUrl: z.string().optional(),
    audioTranscript: z.string().optional(),
    consentConfirmed: z.boolean().optional(),
    nextAction: z.string().optional(),
    nextActionDeadline: z.string().datetime().optional(),
  })
  .refine((v) => v.rawInputType !== 'transcript' || v.consentConfirmed === true, {
    message: '现场录音须先口头告知客户并取得同意（consentConfirmed=true）',
    path: ['consentConfirmed'],
  })

export const ListVisitsQuerySchema = z.object({
  companyId: z.string().optional(),
  projectId: z.string().optional(),
  leadId: z.string().optional(),
  page: z.string().transform(Number).default('1'),
  pageSize: z.string().transform(Number).default('20'),
})

export type CreateVisitInput = z.infer<typeof CreateVisitSchema>
export type UpdateVisitInput = z.infer<typeof UpdateVisitSchema>
export type LogVisitInput = z.infer<typeof LogVisitSchema>
