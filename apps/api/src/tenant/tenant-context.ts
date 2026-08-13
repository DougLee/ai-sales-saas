import { AsyncLocalStorage } from 'async_hooks'
import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '../config/database.js'
import { createTenantPrisma, type TenantUser } from './tenant-guard.js'

export interface TenantContext {
  tenantId: string
  userId: string
  role: string
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>()

export const tenantContextPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (req: FastifyRequest) => {
    const payload = req.user as { tenantId?: string; id?: string; role?: string } | undefined
    const tenantId = payload?.tenantId || 'default'
    const userId = payload?.id || 'anonymous'
    const role = payload?.role || 'SALES'

    const tenantUser: TenantUser = {
      id: userId,
      tenantId,
      orgId: (payload as Record<string, unknown> | undefined)?.orgId as string || '',
      role: role as TenantUser['role'],
    }

    req.tenantContext = { tenantId, userId, role }
    req.tenantPrisma = createTenantPrisma(prisma, tenantUser)

    tenantStorage.run({ tenantId, userId, role }, () => {})
  })
})

// 扩展 FastifyRequest 类型
declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext
    tenantPrisma?: PrismaClient
  }
}
