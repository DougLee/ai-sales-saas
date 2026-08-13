import type { FastifyRequest, FastifyReply } from 'fastify'
import { AuthService } from './auth.service.js'
import { RegisterSchema, LoginSchema } from './auth.schema.js'
import { prisma } from '../config/database.js'
import { sessionService } from '../session/session.service.js'
import { logAudit } from '../infra/audit-middleware.js'

function getClientInfo(req: FastifyRequest) {
  return {
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: (req.headers['user-agent'] as string) || 'unknown',
  }
}

export async function register(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = RegisterSchema.parse(req.body)
    const service = new AuthService(prisma, req.server.jwt)
    const result = await service.register(body)
    const { ip, userAgent } = getClientInfo(req)

    // 注册成功后，给新用户一个 tenantId 上下文（register 时 req.user 还没有）
    const newUser = await prisma.user.findUnique({
      where: { id: result.user.id },
      select: { tenantId: true, email: true, role: true },
    })

    await logAudit(
      prisma,
      { userId: result.user.id, userEmail: result.user.email, tenantId: newUser?.tenantId ?? null, ip, userAgent },
      {
        action: 'REGISTER',
        entity: 'User',
        entityId: result.user.id,
        description: `新用户注册：${result.user.email}（${result.user.role}）`,
        severity: 'info',
        metadata: { email: result.user.email, role: result.user.role },
      }
    )

    reply.send({ success: true, data: result })
  } catch (err) {
    const { ip, userAgent } = getClientInfo(req)
    // 记录注册失败（邮箱已注册、参数错等）
    const body = req.body as { email?: string } | null
    await prisma.loginHistory.create({
      data: {
        email: body?.email ?? 'unknown',
        ip,
        userAgent,
        status: 'register_failed',
        failureReason: (err as Error).message,
      },
    }).catch(() => {})
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function login(req: FastifyRequest, reply: FastifyReply) {
  const { ip, userAgent } = getClientInfo(req)
  const body = (req.body as { email?: string; password?: string } | null) ?? {}

  try {
    const loginBody = LoginSchema.parse(req.body)
    const service = new AuthService(prisma, req.server.jwt)
    const result = await service.login(loginBody)

    // 记录登录成功
    const userRecord = await prisma.user.findUnique({
      where: { id: result.user.id },
      select: { tenantId: true, email: true },
    })
    const tenantId = userRecord?.tenantId ?? null

    await prisma.loginHistory.create({
      data: {
        tenantId,
        userId: result.user.id,
        email: loginBody.email,
        ip,
        userAgent,
        status: 'success',
      },
    }).catch(() => {})

    await logAudit(prisma,
      { userId: result.user.id, userEmail: loginBody.email, tenantId, ip, userAgent },
      {
        action: 'LOGIN',
        entity: 'User',
        entityId: result.user.id,
        description: `登录成功：${result.user.email}`,
        severity: 'info',
        metadata: { kicked: result.kicked ? true : false },
      }
    )

    reply.send({ success: true, data: result })
  } catch (err) {
    // 登录失败：先查 user 是否存在（用于区分 wrong_password / user_not_found）
    let userId: string | null = null
    let tenantId: string | null = null
    let status = 'wrong_password'
    try {
      const u = await prisma.user.findFirst({
        where: { email: body.email ?? '' },
        select: { id: true, tenantId: true, status: true },
      })
      if (!u) {
        status = 'user_not_found'
      } else if (u.status !== 'active') {
        status = 'disabled'
        userId = u.id
        tenantId = u.tenantId
      } else {
        userId = u.id
        tenantId = u.tenantId
      }
    } catch {
      // ignore
    }

    await prisma.loginHistory.create({
      data: {
        tenantId,
        userId,
        email: body.email ?? 'unknown',
        ip,
        userAgent,
        status,
        failureReason: (err as Error).message,
      },
    }).catch(() => {})

    reply.status(401).send({ success: false, error: (err as Error).message })
  }
}

export async function me(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = req.user as { id?: string } | undefined
    if (!payload?.id) {
      return reply.status(401).send({ success: false, error: '未登录' })
    }
    const service = new AuthService(prisma, req.server.jwt)
    const user = await service.me(payload.id)
    reply.send({ success: true, data: user })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function logout(req: FastifyRequest, reply: FastifyReply) {
  const { ip, userAgent } = getClientInfo(req)
  try {
    const payload = req.user as { id?: string; email?: string; tenantId?: string } | undefined
    if (payload?.id) {
      await sessionService.destroySession(payload.id)
      await logAudit(prisma,
        { userId: payload.id, userEmail: payload.email ?? null, tenantId: payload.tenantId ?? null, ip, userAgent },
        {
          action: 'LOGOUT',
          entity: 'User',
          entityId: payload.id,
          description: `登出：${payload.email ?? payload.id}`,
          severity: 'info',
        }
      )
    }
    reply.send({ success: true })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
