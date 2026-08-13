import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Prisma } from '@prisma/client'
import { agentMemory } from './core/agent-memory.js'
import { getPrisma, getUser } from './chat.handler.js'


// ========== 历史会话管理 API ==========

export async function listSessions(req: FastifyRequest, reply: FastifyReply) {
  try {
    const user = getUser(req)
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'
    const prisma = getPrisma(req)

    const sessions = await prisma.chatSession.findMany({
      where: { tenantId, userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        messageCount: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    reply.send({ success: true, data: sessions })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function getSessionMessages(req: FastifyRequest<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>, reply: FastifyReply) {
  try {
    const user = getUser(req)
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'
    const prisma = getPrisma(req)
    const { id } = req.params

    const session = await prisma.chatSession.findFirst({
      where: { id, tenantId, userId },
    })

    if (!session) {
      return reply.status(404).send({ success: false, error: '会话不存在或无权访问' })
    }

    const cursor = req.query.cursor
    const requestedLimit = parseInt(req.query.limit || '20', 10)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 50)
      : 20

    const where: Prisma.ChatMessageWhereInput = { sessionId: id }
    if (cursor) {
      const cursorDate = new Date(cursor)
      if (!Number.isNaN(cursorDate.getTime())) {
        where.createdAt = { lt: cursorDate }
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    })

    const hasMore = messages.length > limit
    if (hasMore) {
      messages.pop()
    }

    // 返回前端按时间升序排列，便于直接渲染
    messages.reverse()

    const nextCursor = hasMore && messages.length > 0
      ? messages[messages.length - 1].createdAt.toISOString()
      : null

    reply.send({
      success: true,
      data: {
        messages,
        nextCursor,
        hasMore,
      },
    })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function deleteSession(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const user = getUser(req)
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'
    const prisma = getPrisma(req)
    const { id } = req.params

    const session = await prisma.chatSession.findFirst({
      where: { id, tenantId, userId },
    })

    if (!session) {
      return reply.status(404).send({ success: false, error: '会话不存在或无权访问' })
    }

    await prisma.chatSession.delete({ where: { id } })
    await agentMemory.clearSession(id)

    reply.send({ success: true })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

