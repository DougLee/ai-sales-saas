import type { Job } from 'bullmq'
import { generateObject } from 'ai'
import { Redis } from 'ioredis'
import { env } from '../config/env.js'
import { logger } from '../infra/logger.js'
import { createModel } from '../config/model-provider.js'
import { loadAllExperts, findExpert } from '../agents/experts/registry.js'
import {
  buildQueue,
  buildReliableWorker,
  type DeadletterEntry,
} from './async-reliability.js'

const redis = new Redis(env.REDIS_URL)

/**
 * V6.1 §九 Phase 2：新增 companion-queue
 * - daily-scan:    每日 09:00 跑全租户扫描
 * - lead-assessment: 线索评估（保留）
 * - companion-snapshot: 客户快照（cron 08:30 跑全租户）
 * - companion-briefing: 销售简报（cron 09:00 跑全销售）
 *
 * 全部 Queue 都通过 buildQueue 应用 DEFAULT_JOB_OPTIONS（attempts=3 + 指数退避）
 * 全部 Worker 都通过 buildReliableWorker 自动入死信
 */

export const scanQueue = buildQueue('daily-scan')
export const leadAssessmentQueue = buildQueue('lead-assessment')
export const companionSnapshotQueue = buildQueue('companion-snapshot')
export const companionBriefingQueue = buildQueue('companion-briefing')
// V6.1 §九 Phase 3：拜访准备自动化 + 录音合规音频清理
export const visitPreparationQueue = buildQueue('visit-preparation')
export const audioCleanupQueue = buildQueue('audio-cleanup')

export function startWorkers() {
  startDailyScanWorker()
  startLeadAssessmentWorker()
  // Phase 2 Task 4 才启动 companion workers（companion snapshot / briefing）
  // —— 这里先注册 worker，cron 注册在 cronCompanion.ts
}

function startDailyScanWorker() {
  const worker = buildReliableWorker<{ tenantId: string; userId: string; triggerSource?: string }, unknown>(
    'daily-scan',
    async (job: Job) => {
      const { tenantId } = job.data
      const { runDailyScan } = await import('../agents/workflows/daily-scan.js')
      const { prisma } = await import('../config/database.js')
      const result = await runDailyScan(prisma, tenantId)

      const key = `alerts:${tenantId}:${new Date().toISOString().slice(0, 10)}`
      await redis.setex(key, 60 * 60 * 24 * 7, JSON.stringify(result))
      await redis.setex(`alerts:${tenantId}:latest`, 60 * 60 * 24 * 7, JSON.stringify(result))

      logger.info({ tenantId, totalAlerts: result.totalAlerts }, 'Daily scan completed')
      return result
    },
  )
  void worker
}

function startLeadAssessmentWorker() {
  const worker = buildReliableWorker<{
    tenantId: string
    leadId: string
    jobId: string
    userId: string
    orgId?: string
  }, unknown>(
    'lead-assessment',
    async (job: Job) => {
      const { tenantId, leadId, jobId, userId, orgId } = job.data
      const { prisma } = await import('../config/database.js')

      await prisma.leadAssessmentJob.update({
        where: { id: jobId },
        data: { status: 'running' },
      })

      try {
        const lead = await prisma.lead.findFirst({
          where: { id: leadId, tenantId, deletedAt: null },
        })
        if (!lead) {
          throw new Error(`Lead not found: ${leadId}`)
        }

        await loadAllExperts()
        const expert = findExpert('lead_assessment')
        if (!expert || !expert.outputSchema) {
          throw new Error('Lead assessment expert not found or missing output schema')
        }

        const prompt = `请基于以下线索信息生成完整的线索评估报告，严格按输出 Schema 返回 JSON：

${JSON.stringify({
          name: lead.name,
          industry: lead.industry,
          source: lead.source,
          contactName: lead.contactName,
          contactPhone: lead.contactPhone,
          contactPosition: lead.contactPosition,
          contactEmail: lead.contactEmail,
          humanInfo: lead.humanInfo,
          businessInfo: lead.businessInfo,
          financeInfo: lead.financeInfo,
          notes: lead.notes,
          followUpCount: lead.followUpCount,
          completenessScore: lead.completenessScore,
        }, null, 2)}`

        const { object } = await generateObject({
          model: createModel() as never,
          schema: expert.outputSchema,
          system: expert.systemPrompt,
          prompt,
        })

        const result = object as {
          scoreOverview: {
            total: number
            grade: 'A级' | 'B级' | 'C级'
          }
        }

        const score = Math.max(0, Math.min(100, Math.round(result.scoreOverview?.total ?? 0)))
        const gradeMap: Record<string, 'A' | 'B' | 'C'> = { 'A级': 'A', 'B级': 'B', 'C级': 'C' }
        const grade = gradeMap[result.scoreOverview?.grade] || (score >= 60 ? 'A' : score >= 40 ? 'B' : 'C')

        await prisma.$transaction([
          prisma.lead.update({
            where: { id: leadId },
            data: {
              score,
              grade,
              assessedAt: new Date(),
              assessedBy: 'AI',
            },
          }),
          prisma.leadAssessmentJob.update({
            where: { id: jobId },
            data: {
              status: 'completed',
              score,
              grade,
              result: result as never,
              completedAt: new Date(),
            },
          }),
        ])

        logger.info({ jobId, leadId, score, grade, userId, orgId }, 'Lead AI assessment completed')
      } catch (err) {
        await prisma.leadAssessmentJob.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            error: (err as Error).message,
            completedAt: new Date(),
          },
        })
        logger.error({ err, jobId, leadId, userId }, 'Lead AI assessment failed')
        throw err
      }
    },
  )
  void worker
}

/**
 * companion-snapshot worker: 给定 tenantId + projectId 跑一次 snapshot
 */
export function startCompanionSnapshotWorker() {
  const worker = buildReliableWorker<{ tenantId: string; projectId: string; userId?: string; triggerSource?: string }, unknown>(
    'companion-snapshot',
    async (job: Job) => {
      const { tenantId, projectId, triggerSource } = job.data
      const { prisma } = await import('../config/database.js')
      const { customerCompanion } = await import('../agents/workflows/customer-companion.js')
      const result = await customerCompanion(prisma, {
        mode: 'snapshot',
        tenantId,
        projectId,
      })
      logger.info(
        { tenantId, projectId, triggerSource, incremental: (result as { incremental?: boolean }).incremental },
        'Companion snapshot completed',
      )
      return result
    },
  )
  void worker
}

/**
 * companion-briefing worker: 给定 tenantId + userId 跑一次 briefing
 */
export function startCompanionBriefingWorker() {
  const worker = buildReliableWorker<{ tenantId: string; userId: string }, unknown>(
    'companion-briefing',
    async (job: Job) => {
      const { tenantId, userId } = job.data
      const { prisma } = await import('../config/database.js')
      const { customerCompanion } = await import('../agents/workflows/customer-companion.js')
      const result = await customerCompanion(prisma, {
        mode: 'briefing',
        tenantId,
        userId,
      })
      logger.info({ tenantId, userId }, 'Companion briefing completed')
      return result
    },
  )
  void worker
}

/**
 * visit-preparation worker（V6.1 §5.2 节点1-2）：
 * 创建拜访后自动触发，10 分钟内生成准备素材并落 visit.attachments
 */
export function startVisitPreparationWorker() {
  const worker = buildReliableWorker<{ tenantId: string; visitId: string; userId: string }, unknown>(
    'visit-preparation',
    async (job: Job) => {
      const { tenantId, visitId, userId } = job.data
      const { prisma } = await import('../config/database.js')
      const { applyPreparationToVisit } = await import('../crm/visits/visit-prep.service.js')
      const result = await applyPreparationToVisit(prisma, { tenantId, visitId, userId })
      if (!result.ok) {
        // 非错误性跳过（无关联商机/已过准备窗口）不重试
        logger.info({ tenantId, visitId, reason: result.reason }, 'visit preparation skipped')
        return result
      }
      logger.info({ tenantId, visitId }, 'visit preparation completed')
      return result
    },
  )
  void worker
}

/** 创建拜访后自动入队准备任务（fail-soft：队列不可用时仅记日志，不阻塞创建） */
export async function enqueueVisitPreparation(data: { tenantId: string; visitId: string; userId: string }) {
  try {
    await visitPreparationQueue.add('prepare', data)
  } catch (err) {
    logger.warn({ err, visitId: data.visitId }, 'enqueue visit-preparation failed (non-blocking)')
  }
}

/**
 * audio-cleanup worker（V6.1 录音合规）：清理超期音频
 * cron 每天 03:30 全租户跑；也可通过 jobs 接口手动触发
 */
export function startAudioCleanupWorker() {
  const worker = buildReliableWorker<{ tenantId: string }, unknown>(
    'audio-cleanup',
    async (job: Job) => {
      const { tenantId } = job.data
      const { prisma } = await import('../config/database.js')
      const { cleanupAudioRetention } = await import('../crm/visits/audio-retention.service.js')
      const result = await cleanupAudioRetention(prisma, tenantId)
      logger.info({ tenantId, purged: result.purged }, 'audio cleanup completed')
      return result
    },
  )
  void worker
}

export async function scheduleAudioCleanup(tenantId: string) {
  await audioCleanupQueue.add(
    'cleanup',
    { tenantId },
    {
      repeat: { pattern: '30 3 * * *' },
      jobId: `audio-cleanup-${tenantId}`,
    },
  )
}

export async function scheduleDailyScan(tenantId: string, userId: string) {
  await scanQueue.add(
    'scan',
    { tenantId, userId },
    {
      repeat: { pattern: '0 9 * * *' },
      jobId: `daily-scan-${tenantId}`,
    },
  )
}

export async function triggerManualScan(tenantId: string, userId: string) {
  return scanQueue.add('scan', { tenantId, userId })
}

/**
 * 死信查询 / 重试 API 委托（避免 controller 直接操作 redis）
 */
export async function listDeadletterJobs(
  queueName: string,
  tenantId: string,
): Promise<DeadletterEntry[]> {
  const { listDeadletter } = await import('./async-reliability.js')
  return listDeadletter(queueName, tenantId)
}

export async function retryDeadletterJob(
  queueName: string,
  tenantId: string,
  jobId: string,
): Promise<{ ok: boolean; newJobId?: string; reason?: string }> {
  const { retryDeadletter } = await import('./async-reliability.js')
  const queue = queueName === 'daily-scan'
    ? scanQueue
    : queueName === 'lead-assessment'
      ? leadAssessmentQueue
      : queueName === 'companion-snapshot'
        ? companionSnapshotQueue
        : queueName === 'companion-briefing'
          ? companionBriefingQueue
          : queueName === 'visit-preparation'
            ? visitPreparationQueue
            : queueName === 'audio-cleanup'
              ? audioCleanupQueue
              : null
  if (!queue) return { ok: false, reason: 'unknown_queue' }
  return retryDeadletter(queue, queueName, tenantId, jobId)
}