import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  createFollowUpReminders,
  releaseUnclaimedCompanies,
  notifyStaleProjects,
} from '../../../../src/agents/workflows/follow-up-reminders.js'

function mockPrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    task: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'task-1' }),
      count: vi.fn().mockResolvedValue(0),
    },
    project: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    visit: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    company: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    timelineEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaClient
}

describe('createFollowUpReminders', () => {
  it('creates task for project nextFollowUp due', async () => {
    const now = new Date()
    const project = {
      id: 'proj-1',
      tenantId: 'tenant-1',
      orgId: 'org-1',
      ownerId: 'user-1',
      name: 'Test Project',
      milestone: 2,
      companyId: 'company-1',
      nextFollowUp: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      company: { id: 'company-1', name: 'Test Company' },
    }
    const prisma = mockPrisma({
      project: { findMany: vi.fn().mockResolvedValue([project]) },
    })

    const result = await createFollowUpReminders(prisma, 'tenant-1', now)

    expect(result.projectReminders).toBe(1)
    expect(result.visitReminders).toBe(0)
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'project_next_follow_up',
          sourceId: 'proj-1',
          ownerId: 'user-1',
          projectId: 'proj-1',
        }),
      }),
    )
  })

  it('creates task for visit nextActionDeadline due', async () => {
    const now = new Date()
    const visit = {
      id: 'visit-1',
      tenantId: 'tenant-1',
      orgId: 'org-1',
      ownerId: 'user-1',
      visitTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      nextAction: 'Send proposal',
      nextActionDeadline: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      projectId: 'proj-1',
      workflowStage: 'REVIEWING',
      project: { id: 'proj-1', name: 'Test Project', companyId: 'company-1', company: { name: 'Test Company' } },
    }
    const prisma = mockPrisma({
      visit: { findMany: vi.fn().mockResolvedValue([visit]) },
    })

    const result = await createFollowUpReminders(prisma, 'tenant-1', now)

    expect(result.projectReminders).toBe(0)
    expect(result.visitReminders).toBe(1)
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'visit_next_action',
          sourceId: 'visit-1',
          ownerId: 'user-1',
        }),
      }),
    )
  })

  it('skips duplicate reminders', async () => {
    const now = new Date()
    const project = {
      id: 'proj-1',
      tenantId: 'tenant-1',
      orgId: 'org-1',
      ownerId: 'user-1',
      name: 'Test Project',
      milestone: 2,
      companyId: 'company-1',
      nextFollowUp: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      company: { id: 'company-1', name: 'Test Company' },
    }
    const prisma = mockPrisma({
      project: { findMany: vi.fn().mockResolvedValue([project]) },
      task: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing' }),
        create: vi.fn().mockResolvedValue({ id: 'task-1' }),
      },
    })

    const result = await createFollowUpReminders(prisma, 'tenant-1', now)

    expect(result.projectReminders).toBe(0)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })
})

describe('releaseUnclaimedCompanies', () => {
  it('releases company with no touch in 72h', async () => {
    const now = new Date()
    const company = {
      id: 'company-1',
      tenantId: 'tenant-1',
      name: 'Test Company',
      ownerId: 'user-1',
      assignedAt: new Date(now.getTime() - 73 * 60 * 60 * 1000),
    }
    const prisma = mockPrisma({
      company: { findMany: vi.fn().mockResolvedValue([company]), update: vi.fn().mockResolvedValue({}) },
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'manager-1', orgId: 'org-1' }]) },
    })

    const released = await releaseUnclaimedCompanies(prisma, 'tenant-1', now)

    expect(released).toBe(1)
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'company-1' },
        data: { ownerId: null, assignedAt: null },
      }),
    )
    expect(prisma.task.create).toHaveBeenCalled()
  })

  it('does not release company with recent activity', async () => {
    const now = new Date()
    const company = {
      id: 'company-1',
      tenantId: 'tenant-1',
      name: 'Test Company',
      ownerId: 'user-1',
      assignedAt: new Date(now.getTime() - 73 * 60 * 60 * 1000),
    }
    const prisma = mockPrisma({
      company: { findMany: vi.fn().mockResolvedValue([company]), update: vi.fn().mockResolvedValue({}) },
      project: { count: vi.fn().mockResolvedValue(1) },
    })

    const released = await releaseUnclaimedCompanies(prisma, 'tenant-1', now)

    expect(released).toBe(0)
    expect(prisma.company.update).not.toHaveBeenCalled()
  })
})

describe('notifyStaleProjects', () => {
  it('notifies owner and managers for stale project over 3 days', async () => {
    const now = new Date()
    const project = {
      id: 'proj-1',
      tenantId: 'tenant-1',
      orgId: 'org-1',
      ownerId: 'user-1',
      name: 'Stale Project',
      isStale: true,
      staleSince: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      companyId: 'company-1',
      company: { id: 'company-1', name: 'Test Company' },
    }
    const prisma = mockPrisma({
      project: { findMany: vi.fn().mockResolvedValue([project]) },
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'manager-1', orgId: 'org-1' }]) },
    })

    const notified = await notifyStaleProjects(prisma, 'tenant-1', now)

    expect(notified).toBe(1)
    expect(prisma.task.create).toHaveBeenCalledTimes(2) // owner + manager
  })
})
