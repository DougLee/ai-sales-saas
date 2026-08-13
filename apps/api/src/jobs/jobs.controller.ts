import type { FastifyRequest, FastifyReply } from 'fastify'
import { listDeadletterJobs, retryDeadletterJob, scheduleAudioCleanup } from './queue.js'
import { scheduleCompanionCron, bootstrapAllSnapshots } from './cronCompanion.js'

function getTenantId(req: FastifyRequest): string {
  const user = req.user as { tenantId?: string } | undefined
  return user?.tenantId || 'default'
}

const ALLOWED_QUEUES = [
  'daily-scan',
  'lead-assessment',
  'companion-snapshot',
  'companion-briefing',
  'visit-preparation',
  'audio-cleanup',
] as const

type AllowedQueue = (typeof ALLOWED_QUEUES)[number]

function isAllowedQueue(name: string): name is AllowedQueue {
  return (ALLOWED_QUEUES as readonly string[]).includes(name)
}

/**
 * GET /api/jobs/deadletter?queue=daily-scan
 * 列出当前租户的失败任务死信（attempts 耗尽）
 */
export async function listDeadletter(
  req: FastifyRequest<{ Querystring: { queue?: string } }>,
  reply: FastifyReply,
) {
  try {
    const tenantId = getTenantId(req)
    const queue = req.query.queue || 'daily-scan'
    if (!isAllowedQueue(queue)) {
      reply.status(400).send({ success: false, error: `queue must be one of ${ALLOWED_QUEUES.join(',')}` })
      return
    }
    const entries = await listDeadletterJobs(queue, tenantId)
    reply.send({ success: true, data: { queue, count: entries.length, entries } })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

/**
 * POST /api/jobs/deadletter/:queue/:jobId/retry
 * 手动重试死信任务：原 job 从死信集合移除并重新入队
 */
export async function retryDeadletter(
  req: FastifyRequest<{ Params: { queue: string; jobId: string } }>,
  reply: FastifyReply,
) {
  try {
    const tenantId = getTenantId(req)
    const { queue, jobId } = req.params
    if (!isAllowedQueue(queue)) {
      reply.status(400).send({ success: false, error: `queue must be one of ${ALLOWED_QUEUES.join(',')}` })
      return
    }
    const result = await retryDeadletterJob(queue, tenantId, jobId)
    reply.send({ success: result.ok, data: result })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

/**
 * POST /api/jobs/cron/register
 * 给当前租户注册 08:30 快照 + 09:00 简报 + 09:00 扫描 + 03:30 音频清理 的 cron 任务
 * 幂等：重复调用会用 jobId 去重
 */
export async function registerCron(req: FastifyRequest, reply: FastifyReply) {
  try {
    const tenantId = getTenantId(req)
    const userId = (req.user as { id?: string } | undefined)?.id ?? 'system'
    await scheduleCompanionCron(tenantId, userId)
    await scheduleAudioCleanup(tenantId)
    reply.send({ success: true, data: { tenantId, message: 'cron registered (idempotent)' } })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

/**
 * POST /api/jobs/cron/bootstrap
 * 批量触发某租户列表的初次快照（Phase 3 上线时使用）
 * Body: { tenantIds: string[] }
 */
export async function bootstrapSnapshots(
  req: FastifyRequest<{ Body: { tenantIds?: string[] } }>,
  reply: FastifyReply,
) {
  try {
    const tenantIds = req.body?.tenantIds || []
    if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
      reply.status(400).send({ success: false, error: 'tenantIds must be a non-empty array' })
      return
    }
    const result = await bootstrapAllSnapshots(tenantIds)
    reply.send({ success: true, data: result })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}