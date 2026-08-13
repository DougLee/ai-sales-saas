import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
}))

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => mockRedis),
}))

vi.mock('../../../../src/config/env.js', () => ({
  env: { REDIS_URL: 'redis://localhost:6379' },
}))

import { AgentMemory } from '../../../../src/agents/core/agent-memory.js'

describe('AgentMemory', () => {
  let memory: AgentMemory

  beforeEach(() => {
    vi.clearAllMocks()
    memory = new AgentMemory()
  })

  it('returns empty array for missing session', async () => {
    mockRedis.get.mockResolvedValue(null)

    const messages = await memory.getSession('session_1')

    expect(messages).toEqual([])
    expect(mockRedis.get).toHaveBeenCalledWith('chat:session:session_1')
  })

  it('parses stored session messages', async () => {
    const messages = [{ role: 'user', content: 'hello', createdAt: '2024-01-01T00:00:00Z' }]
    mockRedis.get.mockResolvedValue(JSON.stringify(messages))

    const result = await memory.getSession('session_1')

    expect(result).toEqual(messages)
  })

  it('appends message and stores context', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify([]))
    mockRedis.setex.mockResolvedValue('OK')
    const message = { role: 'user', content: 'hello', createdAt: '2024-01-01T00:00:00Z' }
    const context = { page: 'dashboard', entityType: 'project', entityId: 'p1' }

    await memory.appendMessage('session_1', message, context)

    expect(mockRedis.setex).toHaveBeenCalledWith(
      'chat:session:session_1',
      expect.any(Number),
      JSON.stringify([message]),
    )
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'chat:session:session_1:context',
      expect.any(Number),
      JSON.stringify(context),
    )
  })

  it('appends message without context', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify([]))
    mockRedis.setex.mockResolvedValue('OK')
    const message = { role: 'assistant', content: 'hi', createdAt: '2024-01-01T00:00:00Z' }

    await memory.appendMessage('session_1', message)

    expect(mockRedis.setex).toHaveBeenCalledTimes(1)
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'chat:session:session_1',
      expect.any(Number),
      JSON.stringify([message]),
    )
  })

  it('returns parsed context', async () => {
    const context = { page: 'projects', entityType: 'project', entityId: 'p1' }
    mockRedis.get.mockResolvedValue(JSON.stringify(context))

    const result = await memory.getContext('session_1')

    expect(result).toEqual(context)
    expect(mockRedis.get).toHaveBeenCalledWith('chat:session:session_1:context')
  })

  it('returns null for missing context', async () => {
    mockRedis.get.mockResolvedValue(null)

    const result = await memory.getContext('session_1')

    expect(result).toBeNull()
  })

  it('clears session and context keys', async () => {
    mockRedis.del.mockResolvedValue(1)

    await memory.clearSession('session_1')

    expect(mockRedis.del).toHaveBeenCalledWith('chat:session:session_1', 'chat:session:session_1:context')
  })
})
