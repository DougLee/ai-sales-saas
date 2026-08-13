import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { pipeline } from '../../../../src/crm/projects/projects.controller.js'

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

function mockRequest(user: Record<string, unknown>, tenantPrisma: PrismaClient) {
  return { user, tenantPrisma } as unknown as Parameters<typeof pipeline>[0]
}

function mockUser(overrides?: Record<string, unknown>) {
  return { id: 'user_1', tenantId: 'tenant_1', orgId: 'org_1', role: 'TENANT_ADMIN', ...overrides }
}

describe('projects.controller pipeline', () => {
  it('groups projects into named milestone columns', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'p1', milestone: 0, name: 'A' },
      { id: 'p2', milestone: 0, name: 'B' },
      { id: 'p3', milestone: 4, name: 'C' },
    ])
    const prisma = { project: { findMany } } as unknown as PrismaClient
    const reply = mockReply()

    await pipeline(mockRequest(mockUser(), prisma), reply as unknown as Parameters<typeof pipeline>[1])

    const payload = reply.getSent().payload as {
      success: boolean
      data: { columns: Array<{ milestone: number; name: string; items: unknown[] }>; total: number }
    }
    expect(payload.success).toBe(true)
    expect(payload.data.total).toBe(3)
    expect(payload.data.columns).toHaveLength(9)
    expect(payload.data.columns[0].name).toBe('初识客户')
    expect(payload.data.columns[0].items).toHaveLength(2)
    expect(payload.data.columns[4].items).toHaveLength(1)
    expect(payload.data.columns[1].items).toHaveLength(0)
  })

  it('scopes query to own data for SALES role', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = { project: { findMany } } as unknown as PrismaClient
    const reply = mockReply()

    await pipeline(mockRequest(mockUser({ role: 'SALES' }), prisma), reply as unknown as Parameters<typeof pipeline>[1])

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: 'user_1', closedAt: null, deletedAt: null }),
      }),
    )
  })

  it('returns 500 on prisma error', async () => {
    const findMany = vi.fn().mockRejectedValue(new Error('db down'))
    const prisma = { project: { findMany } } as unknown as PrismaClient
    const reply = mockReply()

    await pipeline(mockRequest(mockUser(), prisma), reply as unknown as Parameters<typeof pipeline>[1])

    expect(reply.getSent().statusCode).toBe(500)
    expect((reply.getSent().payload as { success: boolean }).success).toBe(false)
  })
})
