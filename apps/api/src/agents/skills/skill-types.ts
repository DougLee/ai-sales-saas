import type { z } from 'zod'
import type { PrismaClient } from '@prisma/client'

export type SkillCategory = 'search' | 'query' | 'action' | 'analysis'

export interface SkillContext {
  tenantId: string
  userId: string
  orgId?: string
  role: string
  prisma: PrismaClient
  traceId?: string
  sessionId?: string
}

export interface SkillInput<T = unknown> {
  params: T
  context: SkillContext
}

export interface SkillError {
  code: string
  message: string
}

export interface SkillOutput<T = unknown> {
  success: boolean
  data?: T
  error?: SkillError
}

export interface SkillDefinition<TInput = unknown, TOutput = unknown> {
  id: string
  name: string
  description: string
  category: SkillCategory
  readOnly: boolean
  inputSchema: z.ZodType<TInput>
  outputSchema: z.ZodType<TOutput>
  execute: (input: SkillInput<TInput>) => Promise<SkillOutput<TOutput>>
}
