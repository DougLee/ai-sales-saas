import type { PrismaClient } from '@prisma/client'
import { deleteFileByUrl } from '../../infra/s3.js'
import { logger } from '../../infra/logger.js'

/**
 * 音频留存清理服务（V6.1 §5.2 节点3 录音合规 / §十二 风险应对）
 *
 * 留存策略：
 * - 原始音频默认保留 90 天（按拜访创建时间），超期自动清除，仅保留转写文本
 * - 项目关闭（成交/丢单）后 30 天自动清除音频
 * - 转写文本（audioTranscript/rawInput）随客户档案保留，不在清理范围
 */

const DEFAULT_RETENTION_DAYS = 90
const PROJECT_CLOSED_RETENTION_DAYS = 30

export interface AudioCleanupResult {
  scanned: number
  purged: number
  failed: number
  purgedVisitIds: string[]
}

export async function cleanupAudioRetention(
  prisma: PrismaClient,
  tenantId: string,
  opts: { now?: Date; retentionDays?: number; closedRetentionDays?: number } = {},
): Promise<AudioCleanupResult> {
  const now = opts.now || new Date()
  const retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS
  const closedRetentionDays = opts.closedRetentionDays ?? PROJECT_CLOSED_RETENTION_DAYS

  const retentionCutoff = new Date(now.getTime() - retentionDays * 86400000)
  const closedCutoff = new Date(now.getTime() - closedRetentionDays * 86400000)

  const candidates = await prisma.visit.findMany({
    where: {
      tenantId,
      audioUrl: { not: null },
      OR: [
        { createdAt: { lt: retentionCutoff } },
        { project: { closedAt: { lt: closedCutoff } } },
      ],
    },
    select: { id: true, audioUrl: true },
  })

  const result: AudioCleanupResult = { scanned: candidates.length, purged: 0, failed: 0, purgedVisitIds: [] }

  for (const visit of candidates) {
    if (!visit.audioUrl) continue
    const deleted = await deleteFileByUrl(visit.audioUrl)
    if (!deleted) {
      result.failed++
      logger.warn({ visitId: visit.id, tenantId }, 'audio purge: delete failed, will retry next run')
      continue
    }
    await prisma.visit.update({ where: { id: visit.id }, data: { audioUrl: null } })
    result.purged++
    result.purgedVisitIds.push(visit.id)
  }

  logger.info(
    { tenantId, scanned: result.scanned, purged: result.purged, failed: result.failed },
    'audio retention cleanup completed',
  )
  return result
}
