import { z } from 'zod'

export const ToolCallSchema = z.object({
  tool: z.string(),
  input: z.record(z.unknown()),
})

export const ToolResultSchema = z.object({
  tool: z.string(),
  output: z.unknown(),
})

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResults: z.array(ToolResultSchema).optional(),
})

export const PageContextSchema = z.object({
  page: z.string(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
})

export const ChatRequestSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
  pageContext: PageContextSchema.optional(),
})
