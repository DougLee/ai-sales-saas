import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listSessions, getSessionMessages, deleteSession } from '../../../src/agents/session.handler.js'

function createMockReply() {
  return {
    send: vi.fn(),
    status: vi.fn().mockReturnThis(),
  } as unknown as {
    send: (payload: unknown) => void
    status: (code: number) => { send: (payload: unknown) => void }
  }
}

function createMockPrisma(messages: Array<{ id: string; role: string; content: string; createdAt: Date }> = []) {
  return {
    chatSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue(messages),
    },
  } as never
}

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user_1', tenantId: 'tenant_1' },
    tenantPrisma: null,
    params: {},
    query: {},
    ...overrides,
  } as never
}

describe('session.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listSessions', () => {
    it('returns sessions for current user', async () => {
      const prisma = createMockPrisma()
      const sessions = [
        { id: 's1', title: '会话1', messageCount: 3, createdAt: new Date(), updatedAt: new Date() },
      ]
      vi.mocked(prisma.chatSession.findMany).mockResolvedValue(sessions as never)

      const req = createMockRequest({ tenantPrisma: prisma })
      const reply = createMockReply()
      await listSessions(req, reply as never)

      expect(prisma.chatSession.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant_1', userId: 'user_1' },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: { id: true, title: true, messageCount: true, createdAt: true, updatedAt: true },
      })
      expect(reply.send).toHaveBeenCalledWith({ success: true, data: sessions })
    })
  })

  describe('getSessionMessages pagination', () => {
    it('returns first page without cursor', async () => {
      const prisma = createMockPrisma()
      const session = { id: 's1', tenantId: 'tenant_1', userId: 'user_1' }
      vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(session as never)

      const messages = Array.from({ length: 21 }, (_, i) => ({
        id: `msg_${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `message ${i}`,
        createdAt: new Date(Date.now() - i * 1000),
      }))
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue(messages as never)

      const req = createMockRequest({
        tenantPrisma: prisma,
        params: { id: 's1' },
        query: { limit: '20' },
      })
      const reply = createMockReply()
      await getSessionMessages(req, reply as never)

      const callArg = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(callArg.success).toBe(true)
      expect(callArg.data.messages).toHaveLength(20)
      expect(callArg.data.hasMore).toBe(true)
      expect(callArg.data.nextCursor).toBeDefined()
      // messages 返回升序，nextCursor 应是最早一条的 ISO 字符串
      const oldestMessage = callArg.data.messages[callArg.data.messages.length - 1]
      expect(callArg.data.nextCursor).toBe(oldestMessage.createdAt.toISOString())
    })

    it('filters by cursor for older messages', async () => {
      const prisma = createMockPrisma()
      const session = { id: 's1', tenantId: 'tenant_1', userId: 'user_1' }
      vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(session as never)

      const olderMessages = [
        { id: 'old_1', role: 'user', content: 'old', createdAt: new Date('2024-01-01T00:00:00Z') },
      ]
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue(olderMessages as never)

      const cursor = '2024-01-02T00:00:00.000Z'
      const req = createMockRequest({
        tenantPrisma: prisma,
        params: { id: 's1' },
        query: { cursor, limit: '20' },
      })
      const reply = createMockReply()
      await getSessionMessages(req, reply as never)

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sessionId: 's1',
            createdAt: { lt: new Date(cursor) },
          },
          orderBy: { createdAt: 'desc' },
          take: 21,
        })
      )
    })

    it('returns hasMore=false when no more messages', async () => {
      const prisma = createMockPrisma()
      const session = { id: 's1', tenantId: 'tenant_1', userId: 'user_1' }
      vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(session as never)

      const messages = [
        { id: 'm1', role: 'user', content: 'hi', createdAt: new Date() },
      ]
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue(messages as never)

      const req = createMockRequest({
        tenantPrisma: prisma,
        params: { id: 's1' },
        query: {},
      })
      const reply = createMockReply()
      await getSessionMessages(req, reply as never)

      const callArg = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(callArg.data.messages).toHaveLength(1)
      expect(callArg.data.hasMore).toBe(false)
      expect(callArg.data.nextCursor).toBeNull()
    })

    it('returns 404 when session not found', async () => {
      const prisma = createMockPrisma()
      vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(null as never)

      const req = createMockRequest({
        tenantPrisma: prisma,
        params: { id: 'missing' },
        query: {},
      })
      const reply = createMockReply()
      await getSessionMessages(req, reply as never)

      expect(reply.status).toHaveBeenCalledWith(404)
    })

    it('caps limit at 50', async () => {
      const prisma = createMockPrisma()
      const session = { id: 's1', tenantId: 'tenant_1', userId: 'user_1' }
      vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(session as never)
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never)

      const req = createMockRequest({
        tenantPrisma: prisma,
        params: { id: 's1' },
        query: { limit: '999' },
      })
      const reply = createMockReply()
      await getSessionMessages(req, reply as never)

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 })
      )
    })
  })

  describe('deleteSession', () => {
    it('deletes session if owned by user', async () => {
      const prisma = createMockPrisma()
      const session = { id: 's1', tenantId: 'tenant_1', userId: 'user_1' }
      vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(session as never)

      const req = createMockRequest({
        tenantPrisma: prisma,
        params: { id: 's1' },
      })
      const reply = createMockReply()
      await deleteSession(req, reply as never)

      expect(prisma.chatSession.delete).toHaveBeenCalledWith({ where: { id: 's1' } })
      expect(reply.send).toHaveBeenCalledWith({ success: true })
    })
  })
})
