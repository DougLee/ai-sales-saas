import { Queue, Worker, type Job } from 'bullmq'
import { Redis } from 'ioredis'
import { env } from '../config/env.js'
import { logger } from '../infra/logger.js'

/**
 * V6.1 §5.2 节点1：异步任务可靠性（重试+死信+前端重试入口）
 *
 * 设计原则：
 * - 所有 Worker 一律 attempts=3 + 指数退避（5s/30s/2m），调用方无需关心
 * - 失败 N 次后入 Redis deadletter:<queueName>:<tenantId>（TTL 7 天），可查询可重试
 * - status 表用 LeadAssessmentJob 模式（持久化 status/result/error），不引入新表
 * - /api/jobs 路由提供 listDeadletter / retryDeadletter 接口
 */

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000, // 5s → 30s → 2m（自动按 attempts 指数推算）
  },
  removeOnComplete: {
    age: 24 * 3600, // 24h 后清理已完成 job
    count: 1000,
  },
  removeOnFail: false, // 失败 job 保留（死信处理用）
}

export const DEADLETTER_TTL_SECONDS = 7 * 24 * 3600

export interface DeadletterEntry {
  queueName: string
  tenantId: string
  jobId: string
  jobName: string
  payload: Record<string, unknown>
  failedReason: string
  attemptsMade: number
  failedAt: string
  /** 重试次数（前端 retryDeadletter 后递增） */
  retriedCount: number
}

const redis = new Redis(env.REDIS_URL)

export function deadletterKey(queueName: string, tenantId: string): string {
  return `deadletter:${queueName}:${tenantId}`
}

/**
 * 把失败 job 写进 Redis 死信集合（Hash：jobId → JSON entry）
 */
export async function recordDeadletter(job: Job, queueName: string): Promise<void> {
  const tenantId =
    typeof job.data?.tenantId === 'string' ? job.data.tenantId : (job.data?.tenantId ?? 'unknown')
  const key = deadletterKey(queueName, tenantId)
  const entry: DeadletterEntry = {
    queueName,
    tenantId,
    jobId: job.id ?? 'unknown',
    jobName: job.name,
    payload: (job.data ?? {}) as Record<string, unknown>,
    failedReason: job.failedReason ?? 'unknown',
    attemptsMade: job.attemptsMade,
    failedAt: new Date().toISOString(),
    retriedCount: 0,
  }
  await redis.hset(key, entry.jobId, JSON.stringify(entry))
  await redis.expire(key, DEADLETTER_TTL_SECONDS)
  logger.warn(
    { queueName, tenantId, jobId: entry.jobId, attemptsMade: entry.attemptsMade, reason: entry.failedReason },
    'Async job deadlettered after retries',
  )
}

/**
 * 读租户死信列表
 */
export async function listDeadletter(
  queueName: string,
  tenantId: string,
): Promise<DeadletterEntry[]> {
  const entries = await redis.hgetall(deadletterKey(queueName, tenantId))
  return Object.values(entries).map((s) => {
    try {
      return JSON.parse(s) as DeadletterEntry
    } catch {
      return null
    }
  }).filter((x): x is DeadletterEntry => x !== null)
}

/**
 * 重试死信 job：从死信集合移除并重新入队
 * 返回重试结果；原 jobId 在新队列中失效，BullMQ 自动生成新 id
 */
export async function retryDeadletter(
  queue: Queue,
  queueName: string,
  tenantId: string,
  jobId: string,
): Promise<{ ok: boolean; newJobId?: string; reason?: string }> {
  const key = deadletterKey(queueName, tenantId)
  const raw = await redis.hget(key, jobId)
  if (!raw) return { ok: false, reason: 'not_found' }
  let entry: DeadletterEntry
  try {
    entry = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'parse_error' }
  }

  const newJob = await queue.add(entry.jobName, entry.payload, {
    ...DEFAULT_JOB_OPTIONS,
    jobId: undefined, // 让 BullMQ 生成新 id
  })

  // 递增重试次数并写回（保留审计轨迹 7 天）
  entry.retriedCount += 1
  entry.failedAt = new Date().toISOString()
  await redis.hset(key, jobId, JSON.stringify(entry))
  await redis.expire(key, DEADLETTER_TTL_SECONDS)

  logger.info(
    { queueName, tenantId, originalJobId: jobId, newJobId: newJob.id, retriedCount: entry.retriedCount },
    'Deadletter job retried',
  )
  return { ok: true, newJobId: newJob.id ?? 'unknown' }
}

/**
 * 通用 Worker 包装：attempts/backoff + 死信捕获 + 失败日志
 */
export function buildReliableWorker<TData extends Record<string, unknown>, TResult>(
  queueName: string,
  processor: (job: Job<TData>) => Promise<TResult>,
): Worker<TData, TResult> {
  const worker = new Worker<TData, TResult>(
    queueName,
    async (job) => processor(job),
    {
      connection: { url: env.REDIS_URL },
      concurrency: 4,
    },
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    const exhausted = (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 1)
    logger.error(
      { queueName, jobId: job.id, attemptsMade: job.attemptsMade, reason: err.message, exhausted },
      'Async job failed',
    )
    if (exhausted) {
      await recordDeadletter(job as Job, queueName)
    }
  })

  worker.on('completed', (job) => {
    logger.info({ queueName, jobId: job.id, ok: true }, 'Async job completed')
  })

  return worker
}

/**
 * 通用 Queue 工厂：应用 DEFAULT_JOB_OPTIONS
 */
export function buildQueue(name: string): Queue {
  return new Queue(name, {
    connection: { url: env.REDIS_URL },
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })
}