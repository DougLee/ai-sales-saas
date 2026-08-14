import { Redis } from 'ioredis'
import { env } from '../../config/env.js'

const redis = new Redis(env.REDIS_URL)

const SESSION_PREFIX = 'chat:session:'
const SESSION_TTL = 60 * 60 * 24 * 7 // 7 days

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: Array<{ tool: string; input: unknown }>
  toolResults?: Array<{ tool: string; output: unknown }>
  createdAt: string
}

export interface SessionContext {
  page?: string
  entityType?: string
  entityId?: string
}

export class AgentMemory {
  async getSession(sessionId: string): Promise<ChatMessage[]> {
    const data = await redis.get(`${SESSION_PREFIX}${sessionId}`)
    if (!data) return []
    return JSON.parse(data) as ChatMessage[]
  }

  async appendMessage(sessionId: string, message: ChatMessage, context?: SessionContext) {
    const messages = await this.getSession(sessionId)
    messages.push(message)
    await redis.setex(
      `${SESSION_PREFIX}${sessionId}`,
      SESSION_TTL,
      JSON.stringify(messages)
    )
    if (context) {
      await redis.setex(
        `${SESSION_PREFIX}${sessionId}:context`,
        SESSION_TTL,
        JSON.stringify(context)
      )
    }
  }

  async getContext(sessionId: string): Promise<SessionContext | null> {
    const data = await redis.get(`${SESSION_PREFIX}${sessionId}:context`)
    if (!data) return null
    return JSON.parse(data) as SessionContext
  }

  /** 写入一个会话级结构化 KV（如"上一轮推荐的目标客户"），7 天 TTL，与消息同生命周期 */
  async setJSON<T>(sessionId: string, key: string, value: T): Promise<void> {
    await redis.setex(
      `${SESSION_PREFIX}${sessionId}:json:${key}`,
      SESSION_TTL,
      JSON.stringify(value),
    )
  }

  /** 读取会话级结构化 KV；不存在或损坏返回 null */
  async getJSON<T = unknown>(sessionId: string, key: string): Promise<T | null> {
    const data = await redis.get(`${SESSION_PREFIX}${sessionId}:json:${key}`)
    if (!data) return null
    try {
      return JSON.parse(data) as T
    } catch {
      return null
    }
  }

  async clearSession(sessionId: string) {
    const jsonKeys = await redis.keys(`${SESSION_PREFIX}${sessionId}:json:*`)
    await redis.del(
      `${SESSION_PREFIX}${sessionId}`,
      `${SESSION_PREFIX}${sessionId}:context`,
      ...jsonKeys,
    )
  }
}

export const agentMemory = new AgentMemory()
