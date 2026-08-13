import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { ListUsersQuerySchema, UpdateUserBodySchema } from './users.schema.js'
import { sessionService } from '../../session/session.service.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string; orgId: string; role: string }
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const query = ListUsersQuerySchema.parse(req.query)

    const where: Record<string, unknown> = { tenantId: user.tenantId }
    if (query.role) where.role = query.role
    if (query.status) where.status = query.status
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          avatarUrl: true,
          orgId: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ])

    reply.send({ success: true, data: { items, total, page: query.page, pageSize: query.pageSize } })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const { id } = req.params as { id: string }
    const body = UpdateUserBodySchema.parse(req.body)

    if (id === user.id && body.role) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: '不能修改自己的角色' },
      })
    }

    const target = await prisma.user.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    })
    if (!target) {
      return reply.status(404).send({ success: false, error: '用户不存在' })
    }

    const updated = await prisma.user.update({
      where: { id },
      data: body,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        avatarUrl: true,
        orgId: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    // 停用账号时销毁其在线会话，立即踢下线（否则旧 token 在 JWT 有效期内仍可用）
    if (body.status === 'inactive') {
      await sessionService.destroySession(id).catch(() => {})
    }

    reply.send({ success: true, data: updated })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function remove(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const { id } = req.params as { id: string }

    if (id === user.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: '不能删除自己' },
      })
    }

    const target = await prisma.user.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    })
    if (!target) {
      return reply.status(404).send({ success: false, error: '用户不存在' })
    }

    await prisma.userSession.deleteMany({ where: { userId: id } })

    try {
      await prisma.user.delete({ where: { id } })
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2003' || code === 'P2014') {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'USER_HAS_DATA',
            message: '该用户关联了业务数据（线索、客户、商机等），无法直接删除，请先转移数据',
          },
        })
      }
      throw err
    }

    reply.send({ success: true, data: null })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
