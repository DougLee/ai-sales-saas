import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock queue 模块（避免实际 Redis 依赖）
vi.mock('../../../src/jobs/queue.js', () => ({
  listDeadletterJobs: vi.fn(),
  retryDeadletterJob: vi.fn(),
  scheduleAudioCleanup: vi.fn().mockResolvedValue(undefined),
}))

// mock cronCompanion 模块
vi.mock('../../../src/jobs/cronCompanion.js', () => ({
  scheduleCompanionCron: vi.fn().mockResolvedValue(undefined),
  bootstrapAllSnapshots: vi.fn().mockResolvedValue({ triggered: 3 }),
}))

import { listDeadletter, retryDeadletter, registerCron, bootstrapSnapshots } from '@/jobs/jobs.controller'

function mockReq(opts: { tenantId?: string; queue?: string; jobId?: string } = {}) {
  return {
    user: { tenantId: opts.tenantId ?? 'tenant-1', id: 'user-1' },
    query: opts.queue ? { queue: opts.queue } : {},
    params: { queue: opts.queue ?? 'daily-scan', jobId: opts.jobId ?? 'job-1' },
  } as never
}

function mockReply() {
  const reply: any = {
    send: vi.fn(),
    status: vi.fn(() => reply),
  }
  return reply
}

describe('jobs.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listDeadletter', () => {
    it('returns 400 when queue is not allowed', async () => {
      const reply = mockReply()
      await listDeadletter(mockReq({ queue: 'unknown-queue' }), reply)
      expect(reply.status).toHaveBeenCalledWith(400)
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    })

    it('returns deadletter entries for allowed queue', async () => {
      const { listDeadletterJobs } = await import('../../../src/jobs/queue.js')
      ;(listDeadletterJobs as any).mockResolvedValue([
        { jobId: 'j1', queueName: 'daily-scan', tenantId: 'tenant-1', attemptsMade: 3 },
      ])
      const reply = mockReply()
      await listDeadletter(mockReq({ queue: 'daily-scan' }), reply)
      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          queue: 'daily-scan',
          count: 1,
          entries: [{ jobId: 'j1', queueName: 'daily-scan', tenantId: 'tenant-1', attemptsMade: 3 }],
        },
      })
    })

    it('defaults queue to daily-scan when omitted', async () => {
      const { listDeadletterJobs } = await import('../../../src/jobs/queue.js')
      ;(listDeadletterJobs as any).mockResolvedValue([])
      const reply = mockReply()
      await listDeadletter(mockReq(), reply)
      expect(listDeadletterJobs).toHaveBeenCalledWith('daily-scan', 'tenant-1')
    })

    it.each(['daily-scan', 'lead-assessment', 'companion-snapshot', 'companion-briefing'])(
      'accepts queue=%s',
      async (q) => {
        const { listDeadletterJobs } = await import('../../../src/jobs/queue.js')
        ;(listDeadletterJobs as any).mockResolvedValue([])
        const reply = mockReply()
        await listDeadletter(mockReq({ queue: q }), reply)
        expect(reply.status).not.toHaveBeenCalledWith(400)
      },
    )
  })

  describe('retryDeadletter', () => {
    it('returns 400 when queue is not allowed', async () => {
      const reply = mockReply()
      await retryDeadletter(mockReq({ queue: 'foo', jobId: 'j1' }), reply)
      expect(reply.status).toHaveBeenCalledWith(400)
    })

    it('returns retry result', async () => {
      const { retryDeadletterJob } = await import('../../../src/jobs/queue.js')
      ;(retryDeadletterJob as any).mockResolvedValue({ ok: true, newJobId: 'new-1' })
      const reply = mockReply()
      await retryDeadletter(mockReq({ queue: 'daily-scan', jobId: 'j1' }), reply)
      expect(reply.send).toHaveBeenCalledWith({ success: true, data: { ok: true, newJobId: 'new-1' } })
    })

    it('returns success=false when retry fails (e.g. not_found)', async () => {
      const { retryDeadletterJob } = await import('../../../src/jobs/queue.js')
      ;(retryDeadletterJob as any).mockResolvedValue({ ok: false, reason: 'not_found' })
      const reply = mockReply()
      await retryDeadletter(mockReq({ queue: 'lead-assessment', jobId: 'missing' }), reply)
      expect(reply.send).toHaveBeenCalledWith({ success: false, data: { ok: false, reason: 'not_found' } })
    })
  })

  describe('registerCron', () => {
    it('调用 scheduleCompanionCron 并返回成功', async () => {
      const { scheduleCompanionCron } = await import('../../../src/jobs/cronCompanion.js')
      const reply = mockReply()
      await registerCron(mockReq({ tenantId: 'tenant-7' }), reply)
      expect(scheduleCompanionCron).toHaveBeenCalledWith('tenant-7', 'user-1')
      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: { tenantId: 'tenant-7', message: 'cron registered (idempotent)' },
      })
    })
  })

  describe('bootstrapSnapshots', () => {
    it('返回 400 当 tenantIds 缺失', async () => {
      const reply = mockReply()
      await bootstrapSnapshots({ body: {} } as never, reply)
      expect(reply.status).toHaveBeenCalledWith(400)
    })

    it('返回 400 当 tenantIds 是空数组', async () => {
      const reply = mockReply()
      await bootstrapSnapshots({ body: { tenantIds: [] } } as never, reply)
      expect(reply.status).toHaveBeenCalledWith(400)
    })

    it('成功时返回 triggered 数', async () => {
      const { bootstrapAllSnapshots } = await import('../../../src/jobs/cronCompanion.js')
      const reply = mockReply()
      await bootstrapSnapshots({ body: { tenantIds: ['a', 'b', 'c'] } } as never, reply)
      expect(bootstrapAllSnapshots).toHaveBeenCalledWith(['a', 'b', 'c'])
      expect(reply.send).toHaveBeenCalledWith({ success: true, data: { triggered: 3 } })
    })
  })
})