import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  listByCustomer,
  listByProject,
} from '../../../../src/crm/activities/activities.controller.js'

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
  return { user, tenantPrisma, params, query: {} } as unknown as Parameters<typeof listByCustomer>[0]
}

function mockUser(overrides?: Record<string, unknown>) {
  return { id: 'user_1', tenantId: 'tenant_1', orgId: 'org_1', role: 'TENANT_ADMIN', ...overrides }
}

describe('activities.controller listByCustomer', () => {
  it('returns paginated timeline events for a customer', async () => {
    const events = [
      { id: 'evt-1', eventType: 'COMPANY_CREATED', eventTime: new Date() },
      { id: 'evt-2', eventType: 'PROJECT_CREATED', eventTime: new Date() },
    ]
    const findFirst = vi.fn().mockResolvedValue({ id: 'cust-1', ownerId: 'user_1' })
    const findMany = vi.fn().mockResolvedValue(events)
    const count = vi.fn().mockResolvedValue(2)
    const prisma = {
      company: { findFirst },
      timelineEvent: { findMany, count },
    } as unknown as PrismaClient
    const reply = mockReply()

    await listByCustomer(
      mockRequest(mockUser(), prisma, { id: 'cust-1' }) as never,
      reply as unknown as Parameters<typeof listByCustomer>[1],
    )

    const payload = reply.getSent().payload as { success: boolean; data: { items: unknown[]; total: number } }
    expect(reply.getSent().statusCode).toBeUndefined()
    expect(payload.success).toBe(true)
    expect(payload.data.items).toHaveLength(2)
    expect(payload.data.total).toBe(2)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant_1', customerId: 'cust-1' }),
        orderBy: { eventTime: 'desc' },
        take: 20,
        skip: 0,
      }),
    )
  })

  it('returns 404 when customer not found', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const prisma = { company: { findFirst } } as unknown as PrismaClient
    const reply = mockReply()

    await listByCustomer(
      mockRequest(mockUser(), prisma, { id: 'missing' }) as never,
      reply as unknown as Parameters<typeof listByCustomer>[1],
    )

    expect(reply.getSent().statusCode).toBe(404)
    expect((reply.getSent().payload as { success: boolean }).success).toBe(false)
  })

  it('returns 400 on unexpected error', async () => {
    const findFirst = vi.fn().mockRejectedValue(new Error('db down'))
    const prisma = { company: { findFirst } } as unknown as PrismaClient
    const reply = mockReply()

    await listByCustomer(
      mockRequest(mockUser(), prisma, { id: 'cust-1' }) as never,
      reply as unknown as Parameters<typeof listByCustomer>[1],
    )

    expect(reply.getSent().statusCode).toBe(400)
    expect((reply.getSent().payload as { success: boolean }).success).toBe(false)
  })
})

describe('activities.controller listByProject', () => {
  it('returns paginated timeline events for a project', async () => {
    const events = [
      { id: 'evt-1', eventType: 'PROJECT_CREATED', eventTime: new Date() },
      { id: 'evt-2', eventType: 'MILESTONE_ADVANCED', eventTime: new Date() },
    ]
    const findFirst = vi.fn().mockResolvedValue({ id: 'proj-1', ownerId: 'user_1', companyId: 'cust-1' })
    const findMany = vi.fn().mockResolvedValue(events)
    const count = vi.fn().mockResolvedValue(2)
    const prisma = {
      project: { findFirst },
      timelineEvent: { findMany, count },
    } as unknown as PrismaClient
    const reply = mockReply()

    await listByProject(
      mockRequest(mockUser(), prisma, { id: 'proj-1' }) as never,
      reply as unknown as Parameters<typeof listByProject>[1],
    )

    const payload = reply.getSent().payload as { success: boolean; data: { items: unknown[]; total: number } }
    expect(payload.success).toBe(true)
    expect(payload.data.items).toHaveLength(2)
    expect(payload.data.total).toBe(2)
  })

  it('returns 404 when project not found', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const prisma = { project: { findFirst } } as unknown as PrismaClient
    const reply = mockReply()

    await listByProject(
      mockRequest(mockUser(), prisma, { id: 'missing' }) as never,
      reply as unknown as Parameters<typeof listByProject>[1],
    )

    expect(reply.getSent().statusCode).toBe(404)
    expect((reply.getSent().payload as { success: boolean }).success).toBe(false)
  })
})
