import { randomUUID } from 'node:crypto'
import { getComponentLogger } from './logger.js'
import type { Logger } from 'pino'

export interface LLMTraceContext {
  component: string
  model: string
  provider?: string
  traceId?: string
  sessionId?: string
  userId?: string
  tenantId?: string
  orgId?: string
  projectId?: string
  customerId?: string
  intent?: string
}

export interface LLMUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface LLMTraceResult extends LLMUsage {
  traceId: string
  latencyMs: number
  model: string
  provider?: string
}

export interface LLMCallResult<T> {
  result: T
  trace: LLMTraceResult
}

/**
 * 包装 LLM 调用，统一记录 trace 日志
 *
 * 使用方式：
 * const { result, trace } = await traceLLMCall(
 *   { component: 'intent-router', model: 'gpt-4', sessionId, userId, tenantId },
 *   async () => {
 *     const r = await generateText({ model, system, prompt })
 *     return { result: r, usage: { promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens, totalTokens: r.usage?.totalTokens } }
 *   }
 * )
 */
export async function traceLLMCall<T>(
  ctx: LLMTraceContext,
  execute: () => Promise<{ result: T; usage?: LLMUsage }>,
): Promise<LLMCallResult<T>> {
  const traceId = ctx.traceId || randomUUID()
  const logger = getComponentLogger('llm', {
    traceId,
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    orgId: ctx.orgId,
  })

  const start = Date.now()
  try {
    const { result, usage } = await execute()
    const latencyMs = Date.now() - start

    logger.info(
      {
        llm: {
          component: ctx.component,
          model: ctx.model,
          provider: ctx.provider,
          latencyMs,
          promptTokens: usage?.promptTokens,
          completionTokens: usage?.completionTokens,
          totalTokens: usage?.totalTokens,
        },
        intent: ctx.intent,
        projectId: ctx.projectId,
        customerId: ctx.customerId,
      },
      'LLM call completed',
    )

    return {
      result,
      trace: {
        traceId,
        latencyMs,
        model: ctx.model,
        provider: ctx.provider,
        ...usage,
      },
    }
  } catch (err) {
    const latencyMs = Date.now() - start
    logger.error(
      {
        llm: {
          component: ctx.component,
          model: ctx.model,
          provider: ctx.provider,
          latencyMs,
        },
        intent: ctx.intent,
        projectId: ctx.projectId,
        customerId: ctx.customerId,
        err,
      },
      'LLM call failed',
    )
    throw err
  }
}

/**
 * 记录不带完整包装的工具调用或子步骤 trace
 */
export function logToolTrace(
  logger: Logger,
  toolName: string,
  durationMs: number,
  ctx?: { sessionId?: string; userId?: string; orgId?: string; input?: unknown; output?: unknown; error?: unknown },
) {
  const level = ctx?.error ? 'error' : 'info'
  logger[level](
    {
      tool: {
        name: toolName,
        durationMs,
        input: ctx?.input,
        output: ctx?.output,
        error: ctx?.error,
      },
      sessionId: ctx?.sessionId,
    },
    ctx?.error ? 'Tool execution failed' : 'Tool execution completed',
  )
}
