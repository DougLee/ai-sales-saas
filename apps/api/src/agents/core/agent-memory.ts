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

  async clearSession(sessionId: string) {
    await redis.del(`${SESSION_PREFIX}${sessionId}`, `${SESSION_PREFIX}${sessionId}:context`)
  }
}

export const agentMemory = new AgentMemory()
