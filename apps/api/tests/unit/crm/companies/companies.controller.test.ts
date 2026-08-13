import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  computeCompany360Stats,
  computeCompany360Risks,
  get,
  merge,
} from '../../../../src/crm/companies/companies.controller.js'

function mockReply() {
  const sent: { statusCode?: number; payload?: unknown } = {}
  return {
    status(code: number) {
      sent.statusCode = code
      return this
    },
    send(payload: unknown) {
      sent.payload = payload
      return this
    },
    getSent: () => sent,
  }
}

function mockRequest(user: Record<string, unknown>, tenantPrisma: PrismaClient, params: { id: string }) {
  return { user, tenantPrisma, params, query: {} } as unknown as Parameters<typeof get>[0]
}

function mockUser(overrides?: Record<string, unknown>) {
  return { id: 'user_1', tenantId: 'tenant_1', orgId: 'org_1', role: 'TENANT_ADMIN', ...overrides }
}

describe('computeCompany360Stats', () => {
  it('computes basic stats', () => {
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

    const company = { updatedAt: oneDayAgo }
    const projects = [
      { closedAt: null, healthScore: 80 },
      { closedAt: new Date('2026-01-01'), healthScore: 50 },
    ] as never[]
    const contacts = [{ decisionRole: 'DECISION_MAKER' }, { decisionRole: 'COACH' }] as never[]
    const visits = [{ visitTime: twoDaysAgo }] as never[]
    const tasks = [{ status: 'PENDING', deadline: new Date('2030-06-25') }] as never[]

    const stats = computeCompany360Stats(company, projects, contacts, visits, tasks)

    expect(stats.projectCount).toBe(2)
    expect(stats.activeProjectCount).toBe(1)
    expect(stats.contactCount).toBe(2)
    expect(stats.decisionMakerCount).toBe(1)
    expect(stats.visitCount).toBe(1)
    expect(stats.pendingTaskCount).toBe(1)
    expect(stats.overdueTaskCount).toBe(0)
    expect(stats.avgHealthScore).toBe(80)
    expect(stats.daysSinceLastContact).toBe(1)
  })

  it('detects overdue tasks', () => {
    const company = { updatedAt: new Date('2026-06-01T10:00:00Z') }
    const projects: never[] = []
    const contacts: never[] = []
    const visits: never[] = []
    const tasks = [
      { status: 'PENDING', deadline: new Date('2026-06-20') },
      { status: 'COMPLETED', deadline: new Date('2026-06-20') },
    ] as never[]

    const stats = computeCompany360Stats(company, projects, contacts, visits, tasks)

    expect(stats.pendingTaskCount).toBe(1)
    expect(stats.overdueTaskCount).toBe(1)
  })

  it('returns null avgHealthScore when no active projects', () => {
    const company = { updatedAt: new Date() }
    const projects = [{ closedAt: new Date(), healthScore: null }] as never[]
    const contacts: never[] = []
    const visits: never[] = []
    const tasks: never[] = []

    const stats = computeCompany360Stats(company, projects, contacts, visits, tasks)

    expect(stats.avgHealthScore).toBeNull()
  })
})

describe('computeCompany360Risks', () => {
  it('detects missing contact', () => {
    const risks = computeCompany360Risks({}, [], [], [], [])
    expect(risks).toHaveLength(2)
    expect(risks[0].type).toBe('MISSING_CONTACT')
    expect(risks[1].type).toBe('NO_ACTIVE_PROJECT')
  })

  it('存量兼容：无联系人档案但公司平铺字段有联系人 → 不报缺少联系人', () => {
    const risks = computeCompany360Risks({ contactPerson: '刘全永' }, [], [], [], [])
    expect(risks.some((r) => r.type === 'MISSING_CONTACT')).toBe(false)
  })

  it('detects overdue tasks', () => {
    const projects = [{ closedAt: null }] as never[]
    const contacts = [{ decisionRole: 'DECISION_MAKER' }] as never[]
    const visits: never[] = []
    const tasks = [{ status: 'PENDING', deadline: new Date('2026-06-01') }] as never[]

    const risks = computeCompany360Risks({}, projects, contacts, visits, tasks)

    expect(risks.some((r) => r.type === 'OVERDUE_TASKS')).toBe(true)
  })

  it('detects missing decision maker', () => {
    const projects = [{ closedAt: null }] as never[]
    const contacts = [{ decisionRole: 'COACH' }] as never[]
    const visits = [{ visitTime: new Date('2026-06-23T10:00:00Z') }] as never[]
    const tasks: never[] = []

    const risks = computeCompany360Risks({}, projects, contacts, visits, tasks)

    expect(risks.some((r) => r.type === 'MISSING_DECISION_MAKER')).toBe(true)
  })

  it('detects long time no visit', () => {
    const projects = [{ closedAt: null }] as never[]
    const contacts = [{ decisionRole: 'DECISION_MAKER' }] as never[]
    const visits = [{ visitTime: new Date('2026-06-01T10:00:00Z') }] as never[]
    const tasks: never[] = []

    const risks = computeCompany360Risks({}, projects, contacts, visits, tasks)

    expect(risks.some((r) => r.type === 'NO_RECENT_CONTACT')).toBe(true)
  })
})

describe('companies.controller get', () => {
  it('returns company detail with stats and risks', async () => {
    const company = {
      id: 'company-1',
      tenantId: 'tenant-1',
      name: 'Test Company',
      ownerId: 'user_1',
      updatedAt: new Date(),
    }
    const projects = [{ id: 'p1', closedAt: null, healthScore: 80 }] as never[]
    const contacts = [{ id: 'c1', decisionRole: 'DECISION_MAKER' }] as never[]
    const visits: never[] = []
    const tasks: never[] = []

    const prisma = {
      company: {
        findFirst: vi.fn().mockResolvedValue(company),
      },
      project: { findMany: vi.fn().mockResolvedValue(projects) },
      contact: { findMany: vi.fn().mockResolvedValue(contacts) },
      visit: { findMany: vi.fn().mockResolvedValue(visits) },
      task: { findMany: vi.fn().mockResolvedValue(tasks) },
    } as unknown as PrismaClient
    const reply = mockReply()

    await get(
      mockRequest(mockUser(), prisma, { id: 'company-1' }) as never,
      reply as unknown as Parameters<typeof get>[1],
    )

    const payload = reply.getSent().payload as {
      success: boolean
      data: { stats: { activeProjectCount: number }; risks: Array<{ type: string }> }
    }
    expect(payload.success).toBe(true)
    expect(payload.data.stats.activeProjectCount).toBe(1)
    expect(payload.data.risks).toHaveLength(0)
  })

  it('returns readonly summary for sales without access', async () => {
    const company = {
      id: 'company-1',
      tenantId: 'tenant-1',
      name: 'Test Company',
      ownerId: 'user_2',
      updatedAt: new Date(),
    }

    const prisma = {
      company: {
        findFirst: vi.fn().mockResolvedValue(company),
      },
    } as unknown as PrismaClient
    const reply = mockReply()

    await get(
      mockRequest(mockUser({ role: 'SALES' }), prisma, { id: 'company-1' }) as never,
      reply as unknown as Parameters<typeof get>[1],
    )

    const payload = reply.getSent().payload as { success: boolean; data: { _readonly: boolean; stats?: unknown } }
    expect(payload.success).toBe(true)
    expect(payload.data._readonly).toBe(true)
    expect(payload.data.stats).toBeUndefined()
  })
})

describe('companies.controller merge', () => {
  function buildMergePrisma(into: Record<string, unknown>, from: Record<string, unknown> | null) {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const companyUpdate = vi.fn().mockResolvedValue({})
    const tx = {
      lead: { updateMany },
      project: { updateMany },
      contact: { updateMany },
      visit: { updateMany },
      task: { updateMany },
      timelineEvent: { updateMany },
      customerSnapshot: { updateMany },
      company: { update: companyUpdate },
    }
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(into) // into
      .mockResolvedValueOnce(from) // from
    const prisma = {
      company: { findFirst, update: companyUpdate },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      timelineEvent: { create: vi.fn().mockResolvedValue({}) },
      changeHistory: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as PrismaClient
    return { prisma, updateMany, companyUpdate, tx }
  }

  function mergeReq(prisma: PrismaClient, params: { id: string }, body: Record<string, unknown>, user = mockUser()) {
    return { user, tenantPrisma: prisma, params, body, query: {} } as unknown as Parameters<typeof merge>[0]
  }

  it('migrates related records and soft-deletes the source company', async () => {
    const into = { id: 'into-1', name: '主客户', ownerId: 'user_1', industry: null }
    const from = { id: 'from-1', name: '从客户', ownerId: 'user_1', industry: '教育' }
    const { prisma, updateMany, companyUpdate } = buildMergePrisma(into, from)
    const reply = mockReply()

    await merge(
      mergeReq(prisma, { id: 'into-1' }, { fromId: 'from-1' }) as never,
      reply as unknown as Parameters<typeof merge>[1],
    )

    const payload = reply.getSent().payload as { success: boolean; data: { migrated: Record<string, number>; filledFields: string[] } }
    expect(payload.success, JSON.stringify(payload)).toBe(true)
    // 7 类关联表各迁移一次
    expect(updateMany).toHaveBeenCalledTimes(7)
    // 从客户为空字段补全主客户（industry）
    expect(payload.data.filledFields).toContain('industry')
    // 软删除从客户 + 标记 mergedIntoId
    expect(companyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'from-1' },
        data: expect.objectContaining({ mergedIntoId: 'into-1' }),
      }),
    )
  })

  it('rejects merging a company into itself', async () => {
    const { prisma } = buildMergePrisma({ id: 'c1', name: 'x', ownerId: 'user_1' }, null)
    const reply = mockReply()

    await merge(
      mergeReq(prisma, { id: 'c1' }, { fromId: 'c1' }) as never,
      reply as unknown as Parameters<typeof merge>[1],
    )

    expect(reply.getSent().statusCode).toBe(400)
    expect((reply.getSent().payload as { error: string }).error).toContain('自身')
  })

  it('returns 404 when source company missing', async () => {
    const { prisma } = buildMergePrisma({ id: 'into-1', name: '主', ownerId: 'user_1' }, null)
    const reply = mockReply()

    await merge(
      mergeReq(prisma, { id: 'into-1' }, { fromId: 'from-1' }) as never,
      reply as unknown as Parameters<typeof merge>[1],
    )

    expect(reply.getSent().statusCode).toBe(404)
  })
})
