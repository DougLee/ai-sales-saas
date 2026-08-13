import type { FastifyInstance } from 'fastify'
import { listDeadletter, retryDeadletter, registerCron, bootstrapSnapshots } from './jobs.controller.js'
import { requireRoles } from '../plugins/rbac.plugin.js'

/** 任务运维接口（死信/定时注册/快照引导）仅管理员可操作 */
const ADMIN_ONLY = { preHandler: [requireRoles('TENANT_ADMIN', 'SUPER_ADMIN')] }

export async function jobsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { queue?: string } }>('/deadletter', ADMIN_ONLY, listDeadletter)
  app.post<{ Params: { queue: string; jobId: string } }>('/deadletter/:queue/:jobId/retry', ADMIN_ONLY, retryDeadletter)
  app.post('/cron/register', ADMIN_ONLY, registerCron)
  app.post<{ Body: { tenantIds?: string[] } }>('/cron/bootstrap', ADMIN_ONLY, bootstrapSnapshots)
}