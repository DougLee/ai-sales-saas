import { Redis } from 'ioredis'
import { env } from '../config/env.js'

const redis = new Redis(env.REDIS_URL)
const SESSION_PREFIX = 'auth:session:'
const SESSION_TTL = 60 * 60 * 24 * 7 // 7 days

export class SessionService {
  async createSession(userId: string, token: string): Promise<{ kicked?: string }> {
    const key = `${SESSION_PREFIX}${userId}`
    const existing = await redis.get(key)
    await redis.setex(key, SESSION_TTL, token)
    return existing ? { kicked: existing } : {}
  }

  async validateSession(userId: string, token: string): Promise<boolean> {
    const key = `${SESSION_PREFIX}${userId}`
    const stored = await redis.get(key)
    return stored === token
  }

  async destroySession(userId: string): Promise<void> {
    const key = `${SESSION_PREFIX}${userId}`
    await redis.del(key)
  }
}

export const sessionService = new SessionService()
