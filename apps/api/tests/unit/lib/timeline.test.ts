import { describe, it, expect, vi } from 'vitest'
import {
  recordTimelineEvent,
  getTimeline,
  getEventsSince,
  getRecentSummary,
} from '../../../src/lib/timeline.js'
import type { PrismaClient } from '@prisma/client'
import { logger } from '../../../src/infra/logger.js'

/** 构造带存在性校验 mock 的 prisma（V6.1：写入前先校验 customer/project 存在） */
function mockPrisma(overrides: {
  create?: ReturnType<typeof vi.fn>
  findMany?: ReturnType<typeof vi.fn>
  count?: ReturnType<typeof vi.fn>
  companyFound?: boolean
  projectFound?: boolean
}) {
  const {
    create = vi.fn().mockResolvedValue({ id: 'evt-1' }),
    findMany = vi.fn().mockResolvedValue([]),
    count = vi.fn().mockResolvedValue(0),
    companyFound = true,
    projectFound = true,
  } = overrides
  const prisma = {
    timelineEvent: { create, findMany, count },
    company: {
      findFirst: vi.fn().mockResolvedValue(companyFound ? { id: 'cust-1' } : null),
    },
    project: {
      findFirst: vi.fn().mockResolvedValue(projectFound ? { id: 'proj-1' } : null),
    },
  } as unknown as PrismaClient
  return { prisma, create, findMany, count }
}

describe('recordTimelineEvent', () => {
  it('creates timeline event with defaults', async () => {
    const { prisma, create } = mockPrisma({})

    await recordTimelineEvent(prisma, {
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      eventType: 'visit',
      sourceType: 'manual',
    })

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        customerType: 'company',
        eventType: 'visit',
        sourceType: 'manual',
        eventData: {},
        factStatus: 'confirmed',
      }),
    })
  })

  it('uses provided optional fields', async () => {
    const { prisma, create } = mockPrisma({})
    const eventTime = new Date('2026-06-13T10:00:00Z')

    await recordTimelineEvent(prisma, {
      tenantId: 'tenant-1',
      ownerId: 'user-1',
      orgId: 'org-1',
      customerId: 'cust-1',
      customerType: 'individual',
      projectId: 'proj-1',
      eventType: 'milestone',
      eventSubtype: 'gate',
      eventData: { note: 'test' },
      sourceType: 'import',
      sourceId: 'src-1',
      sourceLabel: '导入',
      eventTime,
    })

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'user-1',
        orgId: 'org-1',
        customerType: 'individual',
        projectId: 'proj-1',
        eventSubtype: 'gate',
        eventData: { note: 'test' },
        sourceId: 'src-1',
        sourceLabel: '导入',
        eventTime,
      }),
    })
  })

  it('marks AI-produced events as pending_confirmation without confirmedBy/At', async () => {
    const { prisma, create } = mockPrisma({})

    await recordTimelineEvent(prisma, {
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      eventType: 'ai.extraction',
      factStatus: 'pending_confirmation',
      sourceType: 'ai',
    })

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        factStatus: 'pending_confirmation',
        confirmedBy: undefined,
        confirmedAt: undefined,
      }),
    })
  })

  it('rejects orphan event when customer not found (returns null, no create)', async () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const { prisma, create } = mockPrisma({ companyFound: false })

    const result = await recordTimelineEvent(prisma, {
      tenantId: 'tenant-1',
      customerId: 'ghost',
      eventType: 'visit',
      sourceType: 'manual',
    })

    expect(result).toBeNull()
    expect(create).not.toHaveBeenCalled()
    expect(loggerSpy).toHaveBeenCalled()
    loggerSpy.mockRestore()
  })

  it('rejects orphan event when project not found', async () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const { prisma, create } = mockPrisma({ projectFound: false })

    const result = await recordTimelineEvent(prisma, {
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      projectId: 'ghost-proj',
      eventType: 'milestone',
      sourceType: 'system',
    })

    expect(result).toBeNull()
    expect(create).not.toHaveBeenCalled()
    loggerSpy.mockRestore()
  })

  it('logs error without throwing', async () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const create = vi.fn().mockRejectedValue(new Error('DB error'))
    const { prisma } = mockPrisma({ create })

    await expect(
      recordTimelineEvent(prisma, {
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        eventType: 'visit',
        sourceType: 'manual',
      }),
    ).resolves.toBeNull()

    expect(loggerSpy).toHaveBeenCalled()
    loggerSpy.mockRestore()
  })
})

describe('getTimeline — V6.1 确认态隔离', () => {
  it('defaults to confirmed-only (factStatus filter applied)', async () => {
    const { prisma, findMany } = mockPrisma({})

    await getTimeline(prisma, { tenantId: 'tenant-1', customerId: 'cust-1' })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ factStatus: 'confirmed' }),
      }),
    )
  })

  it('includePending=true lifts the factStatus filter', async () => {
    const { prisma, findMany } = mockPrisma({})

    await getTimeline(prisma, { tenantId: 'tenant-1', includePending: true })

    const where = findMany.mock.calls[0][0].where
    expect(where.factStatus).toBeUndefined()
  })
})

describe('getEventsSince — 快照水位线增量查询', () => {
  it('queries confirmed events after the watermark, ascending', async () => {
    const { prisma, findMany } = mockPrisma({})
    const since = new Date('2026-08-01T00:00:00Z')

    await getEventsSince(prisma, { tenantId: 'tenant-1', projectId: 'proj-1', since })

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        eventTime: { gt: since },
        factStatus: 'confirmed',
      },
      orderBy: { eventTime: 'asc' },
      take: 100,
    })
  })
})

describe('getRecentSummary — 陪伴智能体上下文', () => {
  it('only counts confirmed events within the window', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { eventType: 'visit.completed', eventTime: new Date() },
      { eventType: 'ai.risk_alert', eventTime: new Date() },
      { eventType: 'milestone.advanced', eventTime: new Date() },
    ])
    const { prisma } = mockPrisma({ findMany })

    const summary = await getRecentSummary(prisma, { tenantId: 'tenant-1', customerId: 'cust-1', days: 7 })

    const where = findMany.mock.calls[0][0].where
    expect(where.factStatus).toBe('confirmed')
    expect(summary.totalEvents).toBe(3)
    expect(summary.visitCount).toBe(1)
    expect(summary.riskAlerts).toHaveLength(1)
  })
})
