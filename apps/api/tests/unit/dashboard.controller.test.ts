import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { getMe } from '../../src/dashboard/dashboard.controller.js'
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

function mockRequest(user: Record<string, unknown>, tenantPrisma: PrismaClient) {
  return {
    user,
    tenantPrisma,
  } as unknown as Parameters<typeof getMe>[0]
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

describe('dashboard.controller getMe', () => {
  const taskFindMany = vi.fn().mockResolvedValue([])
  const projectFindMany = vi.fn().mockResolvedValue([])
  const leadFindMany = vi.fn().mockResolvedValue([])
  const visitCount = vi.fn().mockResolvedValue(0)

  const basePrisma = {
    task: { findMany: taskFindMany },
    project: { findMany: projectFindMany },
    lead: { findMany: leadFindMany },
    visit: { count: visitCount },
  } as unknown as PrismaClient

  beforeEach(() => {
    taskFindMany.mockReset().mockResolvedValue([])
    projectFindMany.mockReset().mockResolvedValue([])
    leadFindMany.mockReset().mockResolvedValue([])
    visitCount.mockReset().mockResolvedValue(0)
  })

  it('returns empty groups when no data', async () => {
    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma)
    const reply = mockReply()

    await getMe(req, reply as unknown as Parameters<typeof getMe>[1])

    const payload = reply.getSent().payload as { success: boolean; data: Record<string, unknown>; error?: string }
    expect(payload.success, `Expected success but got: ${JSON.stringify(payload)}`).toBe(true)
    expect(payload.data.counts).toEqual({
      totalTasks: 0,
      overdueTasks: 0,
      stuckProjects: 0,
      followUpLeads: 0,
      pendingVisits: 0,
    })
  })

  it('groups overdue task correctly', async () => {
    const deadline = new Date(Date.now() - 24 * 60 * 60 * 1000)
    taskFindMany.mockResolvedValueOnce([
      { id: 'task_1', deadline, priority: 'HIGH', status: 'PENDING', project: { name: 'Project 1' } },
    ])

    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma)
    const reply = mockReply()

    await getMe(req, reply as unknown as Parameters<typeof getMe>[1])

    const payload = reply.getSent().payload as { success: boolean; data: Record<string, unknown> }
    expect(payload.success).toBe(true)
    expect(payload.data.counts).toEqual({
      totalTasks: 1,
      overdueTasks: 1,
      stuckProjects: 0,
      followUpLeads: 0,
      pendingVisits: 0,
    })
    expect((payload.data.todayTasks as { overdue: unknown[] }).overdue).toHaveLength(1)
  })

  it('groups stuck project by low health', async () => {
    projectFindMany.mockResolvedValueOnce([
      { id: 'project_1', healthScore: 30, urgency: 'MEDIUM', tasks: [], isStale: false },
    ])

    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma)
    const reply = mockReply()

    await getMe(req, reply as unknown as Parameters<typeof getMe>[1])

    const payload = reply.getSent().payload as { success: boolean; data: Record<string, unknown> }
    expect(payload.success).toBe(true)
    expect(payload.data.counts).toEqual({
      totalTasks: 0,
      overdueTasks: 0,
      stuckProjects: 1,
      followUpLeads: 0,
      pendingVisits: 0,
    })
    expect((payload.data.stuckProjects as { lowHealth: unknown[] }).lowHealth).toHaveLength(1)
  })

  it('groups long overdue lead', async () => {
    const thirtyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    leadFindMany.mockResolvedValueOnce([
      { id: 'lead_1', createdAt: thirtyDaysAgo, lastFollowUpAt: null, status: 'ACTIVE' },
    ])

    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma)
    const reply = mockReply()

    await getMe(req, reply as unknown as Parameters<typeof getMe>[1])

    const payload = reply.getSent().payload as { success: boolean; data: Record<string, unknown> }
    expect(payload.success).toBe(true)
    expect((payload.data.followUpLeads as { longOverdue: unknown[] }).longOverdue).toHaveLength(1)
  })

  it('does not expose other users tasks', async () => {
    taskFindMany.mockResolvedValueOnce([
      { id: 'task_1', ownerId: 'user_1', title: 'My task', status: 'PENDING' },
    ])

    const tenantPrisma = createTenantPrisma(basePrisma, mockUser())
    const req = mockRequest(mockUser(), tenantPrisma)
    const reply = mockReply()

    await getMe(req, reply as unknown as Parameters<typeof getMe>[1])

    const payload = reply.getSent().payload as { success: boolean; data: Record<string, unknown> }
    expect((payload.data.counts as { totalTasks: number }).totalTasks).toBe(1)
    expect(taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: 'user_1', status: { not: 'COMPLETED' } }),
      })
    )
  })
})
