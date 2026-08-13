import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRedis = vi.hoisted(() => ({
  setex: vi.fn().mockResolvedValue('OK'),
}))

const mockQueueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'job-1' }))
const workerCallbacks = vi.hoisted(() => ({} as Record<string, Function>))
const workerEventHandlers = vi.hoisted(() => ({} as Record<string, Function>))

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
  })),
  Worker: vi.fn().mockImplementation((_name: string, callback: Function) => {
    workerCallbacks[_name] = callback
    return {
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        workerEventHandlers[`${_name}:${event}`] = handler
      }),
    }
  }),
}))

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => mockRedis),
}))

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))

vi.mock('../../../src/config/model-provider.js', () => ({
  createModel: vi.fn().mockReturnValue('mock-model'),
}))

vi.mock('../../../src/agents/experts/registry.js', () => ({
  loadAllExperts: vi.fn().mockResolvedValue(undefined),
  findExpert: vi.fn(),
}))

vi.mock('../../../src/agents/workflows/daily-scan.js', () => ({
  runDailyScan: vi.fn(),
}))

vi.mock('../../../src/config/database.js', () => ({
  prisma: {
    leadAssessmentJob: {
      update: vi.fn().mockResolvedValue({}),
    },
    lead: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation((ops) => Promise.all(ops)),
    $executeRawUnsafe: vi.fn().mockResolvedValue({}),
  },
}))

import { startWorkers, scheduleDailyScan, triggerManualScan, scanQueue, leadAssessmentQueue } from '../../../src/jobs/queue.js'
import { runDailyScan } from '../../../src/agents/workflows/daily-scan.js'
import { prisma } from '../../../src/config/database.js'
import { loadAllExperts, findExpert } from '../../../src/agents/experts/registry.js'
import { generateObject } from 'ai'

describe('jobs/queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts workers without error', () => {
    expect(() => startWorkers()).not.toThrow()
  })

  it('queues are created', () => {
    expect(scanQueue).toBeDefined()
    expect(leadAssessmentQueue).toBeDefined()
  })

  it('schedules daily scan', async () => {
    await scheduleDailyScan('tenant_1', 'user_1')
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'scan',
      { tenantId: 'tenant_1', userId: 'user_1' },
      expect.objectContaining({ repeat: expect.any(Object), jobId: expect.any(String) })
    )
  })

  it('triggers manual scan', async () => {
    const result = await triggerManualScan('tenant_1', 'user_1')
    expect(mockQueueAdd).toHaveBeenCalledWith('scan', { tenantId: 'tenant_1', userId: 'user_1' })
    expect(result).toEqual({ id: 'job-1' })
  })

  describe('daily-scan worker', () => {
    it('runs daily scan and stores result', async () => {
      vi.mocked(runDailyScan).mockResolvedValue({ totalAlerts: 5 })
      startWorkers()
      const callback = workerCallbacks['daily-scan']
      const result = await callback({ data: { tenantId: 'tenant_1', userId: 'user_1' } })
      expect(runDailyScan).toHaveBeenCalledWith(prisma, 'tenant_1')
      expect(mockRedis.setex).toHaveBeenCalledTimes(2)
      expect(result.totalAlerts).toBe(5)
    })

    it('logs failed daily scan', () => {
      startWorkers()
      const handler = workerEventHandlers['daily-scan:failed']
      expect(() => handler({ id: 'job-1' }, new Error('fail'))).not.toThrow()
    })
  })

  describe('lead-assessment worker', () => {
    it('assesses lead successfully', async () => {
      vi.mocked(prisma.lead.findFirst).mockResolvedValue({
        id: 'lead_1',
        name: 'Lead',
        industry: 'edu',
      } as never)
      vi.mocked(findExpert).mockReturnValue({
        outputSchema: {},
        systemPrompt: 'prompt',
      } as never)
      vi.mocked(generateObject).mockResolvedValue({
        object: { scoreOverview: { total: 85, grade: 'A级' } },
      } as never)

      startWorkers()
      const callback = workerCallbacks['lead-assessment']
      const result = await callback({
        data: { tenantId: 'tenant_1', leadId: 'lead_1', jobId: 'job_1', userId: 'user_1', orgId: 'org_1' },
      })

      expect(loadAllExperts).toHaveBeenCalled()
      expect(prisma.leadAssessmentJob.update).toHaveBeenCalled()
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ score: 85, grade: 'A' }),
        })
      )
    })

    it('throws when lead not found', async () => {
      vi.mocked(prisma.lead.findFirst).mockResolvedValue(null)
      startWorkers()
      const callback = workerCallbacks['lead-assessment']
      await expect(
        callback({ data: { tenantId: 'tenant_1', leadId: 'lead_1', jobId: 'job_1', userId: 'user_1' } })
      ).rejects.toThrow('Lead not found')
    })

    it('throws when expert missing', async () => {
      vi.mocked(prisma.lead.findFirst).mockResolvedValue({ id: 'lead_1' } as never)
      vi.mocked(findExpert).mockReturnValue(undefined)
      startWorkers()
      const callback = workerCallbacks['lead-assessment']
      await expect(
        callback({ data: { tenantId: 'tenant_1', leadId: 'lead_1', jobId: 'job_1', userId: 'user_1' } })
      ).rejects.toThrow('Lead assessment expert not found')
    })

    it('marks job failed on error', async () => {
      vi.mocked(prisma.lead.findFirst).mockRejectedValue(new Error('db error'))
      startWorkers()
      const callback = workerCallbacks['lead-assessment']
      await expect(
        callback({ data: { tenantId: 'tenant_1', leadId: 'lead_1', jobId: 'job_1', userId: 'user_1' } })
      ).rejects.toThrow('db error')
      expect(prisma.leadAssessmentJob.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
      )
    })
  })
})
