import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { list } from '../../src/crm/tasks/tasks.controller.js'
import { createTenantPrisma } from '../../src/tenant/tenant-guard.js'

function mockReply() {
  const sent: { statusCode?: number; payload?: unknown } = {}
  return {
    status: function (code: number) {
      sent.statusCode = code
      return this
    },
    send: function (payload: unknown) {
      sent.payload = payload
      return this
    },
    getSent: () => sent,
  }
}

function mockRequest(user: Record<string, unknown>, tenantPrisma: PrismaClient, query: Record<string, string> = {}) {
  return {
    user,
    tenantPrisma,
    query,
  } as unknown as Parameters<typeof list>[0]
}

function mockUser(overrides?: Record<string, unknown>) {
  return {
    id: 'user_1',
    tenantId: 'tenant_1',
    orgId: 'org_1',
    role: 'SALES',
    ...overrides,
  }
}

describe('tasks.controller list', () => {
  const findMany = vi.fn().mockResolvedValue([])
  const basePrisma = {
    task: { findMany },
  } as unknown as PrismaClient

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([])
  })

  it('filters by status', async () => {
    findMany.mockResolvedValueOnce([{ id: 'task_1', status: 'PENDING' }])

    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma, { status: 'PENDING' })
    const reply = mockReply()

    await list(req, reply as unknown as Parameters<typeof list>[1])

    const payload = reply.getSent().payload as { success: boolean; items: unknown[] }
    expect(payload.items).toHaveLength(1)
    expect((payload.items[0] as { status: string }).status).toBe('PENDING')
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING', ownerId: 'user_1' }),
      })
    )
  })

  it('filters by projectId', async () => {
    findMany.mockResolvedValueOnce([{ id: 'task_1', projectId: 'project_1' }])

    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma, { projectId: 'project_1' })
    const reply = mockReply()

    await list(req, reply as unknown as Parameters<typeof list>[1])

    const payload = reply.getSent().payload as { success: boolean; items: unknown[] }
    expect(payload.items).toHaveLength(1)
    expect((payload.items[0] as { projectId: string }).projectId).toBe('project_1')
  })

  it('filters by priority', async () => {
    findMany.mockResolvedValueOnce([{ id: 'task_1', priority: 'HIGH' }])

    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma, { priority: 'HIGH' })
    const reply = mockReply()

    await list(req, reply as unknown as Parameters<typeof list>[1])

    const payload = reply.getSent().payload as { success: boolean; items: unknown[] }
    expect(payload.items).toHaveLength(1)
    expect((payload.items[0] as { priority: string }).priority).toBe('HIGH')
  })

  it('filters overdue tasks', async () => {
    findMany.mockResolvedValueOnce([{ id: 'task_1', status: 'PENDING' }])

    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma, { isOverdue: 'true' })
    const reply = mockReply()

    await list(req, reply as unknown as Parameters<typeof list>[1])

    const payload = reply.getSent().payload as { success: boolean; items: unknown[] }
    expect(payload.items).toHaveLength(1)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deadline: { lt: expect.any(Date) },
          status: { not: 'COMPLETED' },
          ownerId: 'user_1',
        }),
      })
    )
  })

  it('filters by deadline range', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    findMany.mockResolvedValueOnce([{ id: 'task_1' }])

    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma, { deadlineFrom: yesterday, deadlineTo: tomorrow })
    const reply = mockReply()

    await list(req, reply as unknown as Parameters<typeof list>[1])

    const payload = reply.getSent().payload as { success: boolean; items: unknown[] }
    expect(payload.items).toHaveLength(1)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deadline: { gte: new Date(yesterday), lte: new Date(tomorrow) },
          ownerId: 'user_1',
        }),
      })
    )
  })

  it('does not expose other users tasks', async () => {
    findMany.mockResolvedValueOnce([{ id: 'task_1', ownerId: 'user_1' }])

    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma)
    const reply = mockReply()

    await list(req, reply as unknown as Parameters<typeof list>[1])

    const payload = reply.getSent().payload as { success: boolean; items: unknown[] }
    expect(payload.items).toHaveLength(1)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: 'user_1' }),
      })
    )
  })
})
