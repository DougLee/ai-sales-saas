import type { FastifyInstance } from 'fastify'
import { list, update, remove } from './users.controller.js'
import { requireRoles } from '../../plugins/rbac.plugin.js'

export async function usersRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireRoles('TENANT_ADMIN', 'SUPER_ADMIN')] }, list)
  app.patch('/:id', { preHandler: [requireRoles('TENANT_ADMIN', 'SUPER_ADMIN')] }, update)
  app.delete('/:id', { preHandler: [requireRoles('TENANT_ADMIN', 'SUPER_ADMIN')] }, remove)
}
