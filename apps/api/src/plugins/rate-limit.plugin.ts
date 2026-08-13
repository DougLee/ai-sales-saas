import type { FastifyInstance, FastifyRequest } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { Redis } from 'ioredis'
import { env } from '../config/env.js'
import { ErrorCode } from '../errors/error-codes.js'

interface UserPayload {
  id?: string
  tenantId?: string
  role?: string
}

const redisClient = new Redis(env.REDIS_URL)

/**
 * 生成限流 key：优先按用户ID，未登录按 IP
 */
function keyGenerator(req: FastifyRequest): string {
  const user = req.user as UserPayload | undefined
  const userId = user?.id
  if (userId) {
    return `rl:user:${userId}:${req.url}`
  }
  return `rl:ip:${req.ip}:${req.url}`
}

function buildRateLimitError(
  req: FastifyRequest,
  context: { max: number; after: string; ttl: number },
  messagePrefix: string,
) {
  const retryAfterMs = Number.parseInt(context.after, 10)
  return {
    success: false,
    error: {
      code: ErrorCode.RATE_LIMIT_ERROR,
      message: `${messagePrefix}，请在 ${Math.max(1, Math.ceil(retryAfterMs / 1000))} 秒后再试`,
      details: {
        limit: context.max,
        retryAfter: retryAfterMs,
        ttl: context.ttl,
      },
      requestId: req.id,
    },
  }
}

/**
 * 全局限流
 */
export async function registerGlobalRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_DEFAULT_MAX,
    timeWindow: env.RATE_LIMIT_DEFAULT_WINDOW_MS,
    redis: redisClient,
    keyGenerator,
    errorResponseBuilder: (req, context) =>
      buildRateLimitError(req, context, '请求过于频繁'),
  })
}

/**
 * /api/agent/* 严格限流
 * 需在注册 agent 路由前应用，配合 prefix: '/api/agent' 使用
 */
export async function registerAgentRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_AGENT_MAX,
    timeWindow: env.RATE_LIMIT_AGENT_WINDOW_MS,
    redis: redisClient,
    keyGenerator: (req) => {
      const user = req.user as UserPayload | undefined
      const userId = user?.id
      const suffix = userId ? `user:${userId}` : `ip:${req.ip}`
      return `rl:agent:${suffix}`
    },
    errorResponseBuilder: (req, context) =>
      buildRateLimitError(req, context, 'AI 助手调用过于频繁'),
  })
}
