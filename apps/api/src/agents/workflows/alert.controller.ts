import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { Redis } from 'ioredis'
import { env } from '../../config/env.js'
import { runDailyScan } from './daily-scan.js'
import { triggerManualScan } from '../../jobs/queue.js'

const redis = new Redis(env.REDIS_URL)

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getReadKey(tenantId: string, userId: string) {
  return `alerts:read:${tenantId}:${userId}`
}

export async function getAlerts(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = req.user as { id?: string; tenantId?: string } | undefined
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'

    let result: Awaited<ReturnType<typeof runDailyScan>>
    const cached = await redis.get(`alerts:${tenantId}:latest`)
    if (cached) {
      result = JSON.parse(cached)
    } else {
      result = await runDailyScan(prisma, tenantId)
      await redis.setex(`alerts:${tenantId}:latest`, 60 * 60 * 24, JSON.stringify(result))
    }

    const readKey = getReadKey(tenantId, userId)
    const readIds = await redis.smembers(readKey)

    const alertsWithRead = result.alerts.map((a) => ({
      ...a,
      read: readIds.includes(a.id),
    }))
    const unreadCount = alertsWithRead.filter((a) => !a.read).length

    reply.send({
      success: true,
      data: {
        ...result,
        alerts: alertsWithRead,
        unreadCount,
      },
    })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function getUnreadCount(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = req.user as { id?: string; tenantId?: string } | undefined
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'

    let result: Awaited<ReturnType<typeof runDailyScan>>
    const cached = await redis.get(`alerts:${tenantId}:latest`)
    if (cached) {
      result = JSON.parse(cached)
    } else {
      result = await runDailyScan(prisma, tenantId)
      await redis.setex(`alerts:${tenantId}:latest`, 60 * 60 * 24, JSON.stringify(result))
    }

    const readKey = getReadKey(tenantId, userId)
    const readIds = await redis.smembers(readKey)
    const unreadCount = result.alerts.filter((a) => !readIds.includes(a.id)).length

    reply.send({ success: true, data: { unreadCount } })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function markRead(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const user = req.user as { id?: string; tenantId?: string } | undefined
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'

    const readKey = getReadKey(tenantId, userId)
    await redis.sadd(readKey, req.params.id)
    await redis.expire(readKey, 60 * 60 * 24)

    reply.send({ success: true, data: { id: req.params.id, read: true } })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function markAllRead(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = req.user as { id?: string; tenantId?: string } | undefined
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'

    let result: Awaited<ReturnType<typeof runDailyScan>>
    const cached = await redis.get(`alerts:${tenantId}:latest`)
    if (cached) {
      result = JSON.parse(cached)
    } else {
      result = await runDailyScan(prisma, tenantId)
      await redis.setex(`alerts:${tenantId}:latest`, 60 * 60 * 24, JSON.stringify(result))
    }

    const readKey = getReadKey(tenantId, userId)
    if (result.alerts.length > 0) {
      await redis.sadd(readKey, ...result.alerts.map((a) => a.id))
      await redis.expire(readKey, 60 * 60 * 24)
    }

    reply.send({ success: true, data: { readCount: result.alerts.length } })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function triggerScan(req: FastifyRequest, reply: FastifyReply) {
  try {
    const user = req.user as { tenantId?: string; id?: string } | undefined
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'

    const job = await triggerManualScan(tenantId, userId)
    reply.send({ success: true, data: { jobId: job.id, message: '扫描任务已提交' } })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}
