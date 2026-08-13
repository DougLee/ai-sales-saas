import { logger } from '../infra/logger.js'
import {
  companionSnapshotQueue,
  companionBriefingQueue,
  scanQueue,
} from './queue.js'

/**
 * V6.1 §九 时序约定（Phase 2）：
 * - 08:30  刷快照（companion-snapshot queue, 全租户）
 * - 09:00  跑 daily-scan（扫描停滞项目/逾期任务/低健康度）
 * - 09:00  生成简报（companion-briefing queue, 全销售）
 *
 * 设计原则：
 * - 简报读取的是当日最新快照（08:30 跑完再 09:00 简报，时序确保不读过期数据）
 * - cron 注册幂等：同 tenantId 重复调用不会重复注册（用 jobId 去重）
 * - 多租户需 Tom 在 Phase 5 上线前提供「租户列表获取」helper，目前先用单租户 + 可扩展
 *
 * 本机无 git / 备份即版本：此文件改动请同步更新 ai-sales-saas/backups/
 */

const SNAPSHOT_CRON = '30 8 * * *' // 08:30
const SCAN_CRON = '0 9 * * *' // 09:00（保留 Phase 1 已有 scheduleDailyScan）
const BRIEFING_CRON = '0 9 * * *' // 09:00（与扫描并发：快照已 08:30 跑过，简报可安全读）

/**
 * 注册某租户的 companion cron（全 3 个队列）
 * 幂等：重复调用会用 jobId 去重
 */
export async function scheduleCompanionCron(tenantId: string, userId: string): Promise<void> {
  await Promise.all([
    companionSnapshotQueue.add(
      'snapshot',
      { tenantId, userId, triggerSource: 'cron-0830' },
      { repeat: { pattern: SNAPSHOT_CRON }, jobId: `companion-snapshot-${tenantId}` },
    ),
    // daily-scan 已有 scheduleDailyScan(tenantId, userId)，此处不重复注册
    scanQueue.add(
      'scan',
      { tenantId, userId, triggerSource: 'cron-0900-scan' },
      { repeat: { pattern: SCAN_CRON }, jobId: `daily-scan-${tenantId}` },
    ),
    companionBriefingQueue.add(
      'briefing',
      { tenantId, userId, triggerSource: 'cron-0900-briefing' },
      { repeat: { pattern: BRIEFING_CRON }, jobId: `companion-briefing-${tenantId}` },
    ),
  ])
  logger.info(
    { tenantId, userId, snapshotCron: SNAPSHOT_CRON, scanCron: SCAN_CRON, briefingCron: BRIEFING_CRON },
    'Companion cron registered',
  )
}

/**
 * 给已注册的所有租户触发一次 manual snapshot
 * Phase 3 上线时调用：上线后第一次让所有活跃项目都先生成一张快照
 */
export async function bootstrapAllSnapshots(tenantIds: string[]): Promise<{ triggered: number }> {
  let triggered = 0
  for (const tenantId of tenantIds) {
    await companionSnapshotQueue.add(
      'snapshot',
      { tenantId, triggerSource: 'bootstrap' },
      { jobId: `companion-snapshot-bootstrap-${tenantId}-${Date.now()}` },
    )
    triggered++
  }
  logger.info({ count: triggered }, 'Bootstrap snapshots triggered')
  return { triggered }
}

/**
 * 单客户手动刷快照（V6.1 §4.2 验收要求）
 * 与 cron job 同走 companion-snapshot 队列，自动应用 attempts/backoff/死信策略
 */
export async function triggerProjectSnapshot(tenantId: string, projectId: string, userId?: string): Promise<string> {
  const job = await companionSnapshotQueue.add(
    'snapshot',
    { tenantId, projectId, userId, triggerSource: 'manual' },
    { jobId: `companion-snapshot-manual-${tenantId}-${projectId}-${Date.now()}` },
  )
  logger.info({ tenantId, projectId, userId, jobId: job.id }, 'Manual snapshot triggered')
  return job.id ?? 'unknown'
}