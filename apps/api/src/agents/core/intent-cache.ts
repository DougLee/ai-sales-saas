import { createHash } from 'node:crypto'
import { Redis } from 'ioredis'
import { env } from '../../config/env.js'

const redis = new Redis(env.REDIS_URL)

const INTENT_CACHE_PREFIX = 'intent:'
const INTENT_CACHE_TTL = 60 * 60 // 1 hour

export interface CachedIntent {
  intent: string
  confidence: number
  entityType?: string
  parameters: {
    region?: string
    product?: string
    targetName?: string
    scene?: string
    error?: string
  }
}

function hashMessage(message: string): string {
  return createHash('sha256').update(message).digest('hex').slice(0, 16)
}

export function getIntentCacheKey(message: string, tenantId = 'default'): string {
  return `${INTENT_CACHE_PREFIX}${tenantId}:${hashMessage(message)}`
}

export async function getCachedIntent(message: string, tenantId?: string): Promise<CachedIntent | null> {
  const raw = await redis.get(getIntentCacheKey(message, tenantId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as CachedIntent
  } catch {
    return null
  }
}

export async function setCachedIntent(message: string, value: CachedIntent, tenantId?: string): Promise<void> {
  await redis.setex(getIntentCacheKey(message, tenantId), INTENT_CACHE_TTL, JSON.stringify(value))
}

export async function clearIntentCache(message: string, tenantId?: string): Promise<void> {
  await redis.del(getIntentCacheKey(message, tenantId))
}
