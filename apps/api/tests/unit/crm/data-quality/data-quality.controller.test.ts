import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { getDataQualitySummary } from '../../../../src/crm/data-quality/data-quality.controller.js'
import { createTenantPrisma } from '../../../../src/tenant/tenant-guard.js'

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

function mockUser(overrides?: Record<string, unknown>) {
  return { id: 'user_1', tenantId: 'tenant_1', orgId: 'org_1', role: 'SALES', ...overrides }
}

function mockRequest(user: Record<string, unknown>, tenantPrisma: PrismaClient) {
  return {
    user,
    tenantPrisma,
    log: { error: vi.fn() },
  } as unknown as Parameters<typeof getDataQualitySummary>[0]
}

describe('data-quality.controller getDataQualitySummary', () => {
  const companyFindMany = vi.fn()
  const leadCount = vi.fn()
  const leadFindMany = vi.fn()
  const projectCount = vi.fn()
  const projectFindMany = vi.fn()
  const visitGroupBy = vi.fn()

  const basePrisma = {
    company: { findMany: companyFindMany },
    lead: { count: leadCount, findMany: leadFindMany },
    project: { count: projectCount, findMany: projectFindMany },
    visit: { groupBy: visitGroupBy },
  } as unknown as PrismaClient

  beforeEach(() => {
    companyFindMany.mockReset().mockResolvedValue([])
    leadCount.mockReset().mockResolvedValue(0)
    leadFindMany.mockReset().mockResolvedValue([])
    projectCount.mockReset().mockResolvedValue(0)
    projectFindMany.mockReset().mockResolvedValue([])
    visitGroupBy.mockReset().mockResolvedValue([])
  })

  function run(user = mockUser()) {
    const tenantPrisma = createTenantPrisma(basePrisma, user)
    const req = mockRequest(user, tenantPrisma)
    const reply = mockReply()
    return getDataQualitySummary(req, reply as unknown as Parameters<typeof getDataQualitySummary>[1]).then(
      () => reply.getSent().payload as { success: boolean; data: Record<string, unknown>; error?: string },
    )
  }

  it('returns empty summary when no data', async () => {
    const payload = await run()
    expect(payload.success, JSON.stringify(payload)).toBe(true)
    expect(payload.data.completeness).toMatchObject({ high: 0, medium: 0, low: 0, total: 0, avgScore: 0 })
    expect((payload.data.duplicates as { groups: number }).groups).toBe(0)
  })

  it('buckets completeness scores correctly', async () => {
    companyFindMany.mockResolvedValueOnce([
      { id: 'c1', name: '甲公司', completenessScore: 90, status: 'following' },
      { id: 'c2', name: '乙公司', completenessScore: 60, status: 'following' },
      { id: 'c3', name: '丙公司', completenessScore: 20, status: 'target' },
    ])
    const payload = await run()
    expect(payload.data.completeness).toMatchObject({ high: 1, medium: 1, low: 1, total: 3, avgScore: 57 })
  })

  it('detects duplicate companies by normalized name', async () => {
    companyFindMany.mockResolvedValueOnce([
      { id: 'c1', name: '阿里巴巴有限公司', completenessScore: 80, status: 'following' },
      { id: 'c2', name: '阿里巴巴（有限公司）', completenessScore: 70, status: 'following' },
      { id: 'c3', name: '腾讯', completenessScore: 50, status: 'following' },
    ])
    const payload = await run()
    const dup = payload.data.duplicates as { groups: number; companies: number }
    expect(dup.groups).toBe(1)
    expect(dup.companies).toBe(2)
  })

  it('flags following customers with no recent visit as stale', async () => {
    companyFindMany.mockResolvedValueOnce([
      { id: 'c1', name: '老客户', completenessScore: 80, status: 'following' },
      { id: 'c2', name: '新客户', completenessScore: 80, status: 'following' },
    ])
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    visitGroupBy.mockResolvedValueOnce([
      { companyId: 'c1', _max: { visitTime: fortyDaysAgo } },
      // c2 has no visits
    ])
    const payload = await run()
    const stale = payload.data.staleCustomers as { count: number }
    expect(stale.count).toBe(2)
  })

  it('scopes queries to current sales user', async () => {
    await run(mockUser({ role: 'SALES' }))
    expect(companyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ownerId: 'user_1', deletedAt: null }) }),
    )
  })

  it('returns 500 on prisma error', async () => {
    companyFindMany.mockRejectedValueOnce(new Error('db down'))
    const payload = await run()
    expect(payload.success).toBe(false)
    expect(payload.error).toBe('db down')
  })
})
