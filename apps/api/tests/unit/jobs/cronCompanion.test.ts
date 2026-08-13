import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock queue 依赖
vi.mock('../../../src/jobs/queue.js', () => ({
  companionSnapshotQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }) },
  companionBriefingQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }) },
  scanQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }) },
}))

import {
  scheduleCompanionCron,
  bootstrapAllSnapshots,
  triggerProjectSnapshot,
} from '@/jobs/cronCompanion'
import {
  companionSnapshotQueue,
  companionBriefingQueue,
  scanQueue,
} from '../../../src/jobs/queue.js'

describe('cronCompanion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('scheduleCompanionCron (V6.1 §九 时序：08:30 快照 → 09:00 扫描+简报)', () => {
    it('注册 3 个 repeat job：08:30 snapshot / 09:00 scan / 09:00 briefing', async () => {
      await scheduleCompanionCron('tenant-A', 'user-1')

      expect(companionSnapshotQueue.add).toHaveBeenCalledTimes(1)
      expect(scanQueue.add).toHaveBeenCalledTimes(1)
      expect(companionBriefingQueue.add).toHaveBeenCalledTimes(1)
    })

    it('snapshot jobId 包含 tenantId（幂等去重）', async () => {
      await scheduleCompanionCron('tenant-X', 'user-1')
      const snapshotCall = (companionSnapshotQueue.add as any).mock.calls[0]
      expect(snapshotCall[2].jobId).toBe('companion-snapshot-tenant-X')
      expect(snapshotCall[2].repeat.pattern).toBe('30 8 * * *')
      expect(snapshotCall[1].tenantId).toBe('tenant-X')
      expect(snapshotCall[1].triggerSource).toBe('cron-0830')
    })

    it('scan jobId 包含 tenantId + cron-0900-scan triggerSource', async () => {
      await scheduleCompanionCron('tenant-Y', 'user-2')
      const scanCall = (scanQueue.add as any).mock.calls[0]
      expect(scanCall[2].jobId).toBe('daily-scan-tenant-Y')
      expect(scanCall[2].repeat.pattern).toBe('0 9 * * *')
      expect(scanCall[1].triggerSource).toBe('cron-0900-scan')
    })

    it('briefing jobId 包含 tenantId + cron-0900-briefing triggerSource', async () => {
      await scheduleCompanionCron('tenant-Z', 'user-3')
      const briefingCall = (companionBriefingQueue.add as any).mock.calls[0]
      expect(briefingCall[2].jobId).toBe('companion-briefing-tenant-Z')
      expect(briefingCall[2].repeat.pattern).toBe('0 9 * * *')
      expect(briefingCall[1].triggerSource).toBe('cron-0900-briefing')
    })

    it('幂等：重复调用不报错（BullMQ 用 jobId 去重）', async () => {
      await expect(scheduleCompanionCron('tenant-A', 'user-1')).resolves.not.toThrow()
      await expect(scheduleCompanionCron('tenant-A', 'user-1')).resolves.not.toThrow()
      expect(companionSnapshotQueue.add).toHaveBeenCalledTimes(2)
    })
  })

  describe('bootstrapAllSnapshots', () => {
    it('每个 tenant 入队一次 snapshot job', async () => {
      const result = await bootstrapAllSnapshots(['t1', 't2', 't3'])
      expect(result.triggered).toBe(3)
      expect(companionSnapshotQueue.add).toHaveBeenCalledTimes(3)
    })

    it('空数组也返回 triggered=0（不抛错）', async () => {
      const result = await bootstrapAllSnapshots([])
      expect(result.triggered).toBe(0)
      expect(companionSnapshotQueue.add).not.toHaveBeenCalled()
    })
  })

  describe('triggerProjectSnapshot (manual 单项目触发)', () => {
    it('返回新 jobId', async () => {
      const jobId = await triggerProjectSnapshot('tenant-A', 'project-1', 'user-1')
      expect(jobId).toBe('mock-job-id')
      expect(companionSnapshotQueue.add).toHaveBeenCalledTimes(1)
    })

    it('jobId 含 tenantId+projectId+timestamp 避免去重冲突', async () => {
      await triggerProjectSnapshot('tenant-A', 'project-1', 'user-1')
      const call = (companionSnapshotQueue.add as any).mock.calls[0]
      expect(call[2].jobId).toMatch(/^companion-snapshot-manual-tenant-A-project-1-\d+$/)
      expect(call[1].triggerSource).toBe('manual')
    })
  })
})