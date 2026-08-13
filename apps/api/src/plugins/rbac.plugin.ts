import type { FastifyRequest, FastifyReply } from 'fastify'
import type { UserRole } from '@prisma/client'

export function requireRoles(...roles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.tenantContext
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: '未登录' },
      })
    }
    if (!roles.includes(user.role as UserRole)) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: '无权访问此资源' },
      })
    }
  }
}
