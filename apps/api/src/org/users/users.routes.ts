import type { FastifyInstance } from 'fastify'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { list, update, remove } from './users.controller.js'
import { requireRoles } from '../../plugins/rbac.plugin.js'

/** 可分配成员下拉（客户池批量分配负责人用）：DEPT_HEAD 也可用，仅返回 id/name */
export async function assignable(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = req.tenantPrisma!
    const user = req.user as { tenantId: string }
    const items = await prisma.user.findMany({
      where: { tenantId: user.tenantId, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    })
    reply.send({ success: true, items })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function usersRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireRoles('TENANT_ADMIN', 'SUPER_ADMIN')] }, list)
  app.get('/assignable', { preHandler: [requireRoles('TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD')] }, assignable)
  app.patch('/:id', { preHandler: [requireRoles('TENANT_ADMIN', 'SUPER_ADMIN')] }, update)
  app.delete('/:id', { preHandler: [requireRoles('TENANT_ADMIN', 'SUPER_ADMIN')] }, remove)
}
