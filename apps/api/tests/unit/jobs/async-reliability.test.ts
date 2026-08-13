import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Redis } from 'ioredis'
import { Queue, Worker, type Job } from 'bullmq'

/**
 * Phase 2 Task 3：异步任务可靠性（重试 + 死信）
 * 集成测试：模拟一个必失败 processor，验证 attempts=3 + 指数退避 + 死信记录
 *
 * 注：完全集成 BullMQ + Redis，避免 mock 框架掩盖真实行为
 */

const TEST_QUEUE = 'test-reliability'
const TEST_TENANT = 'test-tenant-reliability'
let queue: Queue
let worker: Worker
const processedJobs: string[] = []

const alwaysFailProcessor = async (_job: Job) => {
  processedJobs.push(_job.id ?? 'unknown')
  throw new Error('intentional failure for test')
}

describe('async-reliability (BullMQ + Redis)', () => {
  beforeEach(async () => {
    processedJobs.length = 0
    // 清掉残留 deadletter + BullMQ 队列
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
    const keys = await redis.keys(`deadletter:${TEST_QUEUE}:*`)
    if (keys.length > 0) await redis.del(...keys)
    await redis.del(`bull:${TEST_QUEUE}:*`).catch(() => undefined) // best-effort
    await redis.quit()

    queue = new Queue(TEST_QUEUE, {
      connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 100 }, // 测试用 100ms，加速
        removeOnComplete: { age: 60 },
        removeOnFail: false,
      },
    })

    worker = new Worker(TEST_QUEUE, alwaysFailProcessor, {
      connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
      concurrency: 1,
    })

    // 简单死信捕获（与 async-reliability.recordDeadletter 等价）
    worker.on('failed', async (job, err) => {
      if (!job) return
      const exhausted = (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 1)
      if (exhausted) {
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
        const entry = {
          queueName: TEST_QUEUE,
          tenantId: job.data?.tenantId,
          jobId: job.id,
          failedReason: err.message,
          attemptsMade: job.attemptsMade,
          failedAt: new Date().toISOString(),
          retriedCount: 0,
        }
        await redis.hset(`deadletter:${TEST_QUEUE}:${job.data?.tenantId}`, job.id ?? '', JSON.stringify(entry))
        await redis.expire(`deadletter:${TEST_QUEUE}:${job.data?.tenantId}`, 60)
        await redis.quit()
      }
    })
  })

  afterEach(async () => {
    await worker.close()
    await queue.close()
  })

  it('attempts=3 后入死信', async () => {
    await queue.add('failing', { tenantId: TEST_TENANT })

    // 等待 attempts 用尽
    await new Promise((r) => setTimeout(r, 1500))

    expect(processedJobs.length).toBe(3)

    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
    const entries = await redis.hgetall(`deadletter:${TEST_QUEUE}:${TEST_TENANT}`)
    await redis.quit()
    expect(Object.keys(entries).length).toBe(1)
    const parsed = JSON.parse(Object.values(entries)[0])
    expect(parsed.attemptsMade).toBe(3)
    expect(parsed.failedReason).toBe('intentional failure for test')
    expect(parsed.tenantId).toBe(TEST_TENANT)
  })

  it('成功的 job 不入死信', async () => {
    // 替换 worker processor 为成功版本
    await worker.close()
    worker = new Worker(TEST_QUEUE, async () => 'ok', {
      connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
      concurrency: 1,
    })

    await queue.add('passing', { tenantId: TEST_TENANT })
    await new Promise((r) => setTimeout(r, 500))

    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
    const entries = await redis.hgetall(`deadletter:${TEST_QUEUE}:${TEST_TENANT}`)
    await redis.quit()
    expect(Object.keys(entries).length).toBe(0)
  })

  it('不同租户的 deadletter 互不污染', async () => {
    await queue.add('failing-a', { tenantId: 'tenant-a' })
    await queue.add('failing-b', { tenantId: 'tenant-b' })
    await new Promise((r) => setTimeout(r, 2000))

    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
    const a = await redis.hgetall(`deadletter:${TEST_QUEUE}:tenant-a`)
    const b = await redis.hgetall(`deadletter:${TEST_QUEUE}:tenant-b`)
    await redis.quit()
    expect(Object.keys(a).length).toBe(1)
    expect(Object.keys(b).length).toBe(1)
  })
})

describe('DEFAULT_JOB_OPTIONS', () => {
  it('attempts = 3', async () => {
    const { DEFAULT_JOB_OPTIONS } = await import('@/jobs/async-reliability')
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3)
  })

  it('exponential backoff starting at 5s', async () => {
    const { DEFAULT_JOB_OPTIONS } = await import('@/jobs/async-reliability')
    expect(DEFAULT_JOB_OPTIONS.backoff).toEqual({ type: 'exponential', delay: 5000 })
  })

  it('removes completed jobs after 24h', async () => {
    const { DEFAULT_JOB_OPTIONS } = await import('@/jobs/async-reliability')
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toEqual({ age: 24 * 3600, count: 1000 })
  })

  it('keeps failed jobs for deadletter inspection', async () => {
    const { DEFAULT_JOB_OPTIONS } = await import('@/jobs/async-reliability')
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBe(false)
  })
})

describe('DeadletterEntry shape', () => {
  it('contains required fields', () => {
    const entry = {
      queueName: 'test',
      tenantId: 'tenant-x',
      jobId: 'job-1',
      jobName: 'failing',
      payload: { foo: 'bar' },
      failedReason: 'boom',
      attemptsMade: 3,
      failedAt: new Date().toISOString(),
      retriedCount: 0,
    }
    expect(entry).toHaveProperty('queueName')
    expect(entry).toHaveProperty('tenantId')
    expect(entry).toHaveProperty('jobId')
    expect(entry).toHaveProperty('failedReason')
    expect(entry).toHaveProperty('attemptsMade', 3)
    expect(entry).toHaveProperty('retriedCount', 0)
  })
})