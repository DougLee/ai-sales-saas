import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logAudit, ctxFromRequest } from '../../../src/infra/audit-middleware.js'
import type { FastifyRequest } from 'fastify'

function mockPrisma(create?: unknown) {
  return {
    auditLog: { create: create ?? vi.fn().mockResolvedValue({}) },
  } as never
}

function mockReq(overrides?: Record<string, unknown>): FastifyRequest {
  return {
    user: { id: 'user_1', tenantId: 'tenant_1', email: 'test@example.com' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'test-agent' },
    ...overrides,
  } as unknown as FastifyRequest
}

describe('audit-middleware', () => {
  describe('ctxFromRequest', () => {
    it('builds context from request', () => {
      const ctx = ctxFromRequest(mockReq())
      expect(ctx).toEqual({
        userId: 'user_1',
        userEmail: 'test@example.com',
        tenantId: 'tenant_1',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      })
    })

    it('falls back to socket remote address', () => {
      const ctx = ctxFromRequest(mockReq({ ip: undefined }))
      expect(ctx.ip).toBe('127.0.0.1')
    })

    it('falls back to unknown when no IP/UA', () => {
      const ctx = ctxFromRequest(mockReq({ ip: undefined, socket: undefined, headers: {} }))
      expect(ctx.ip).toBe('unknown')
      expect(ctx.userAgent).toBe('unknown')
    })

    it('returns null user info when req.user is missing', () => {
      const ctx = ctxFromRequest(mockReq({ user: undefined }))
      expect(ctx.userId).toBeNull()
      expect(ctx.tenantId).toBeNull()
    })
  })

  describe('logAudit', () => {
    it('creates audit log with context', async () => {
      const create = vi.fn().mockResolvedValue({})
      const prisma = mockPrisma(create)
      const ctx = {
        userId: 'user_1',
        userEmail: 'test@example.com',
        tenantId: 'tenant_1',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      }

      await logAudit(prisma, ctx, {
        action: 'TEST',
        entity: 'User',
        entityId: 'user_1',
        description: 'test action',
        severity: 'critical',
      })

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant_1',
          userId: 'user_1',
          userEmail: 'test@example.com',
          action: 'TEST',
          entity: 'User',
          entityId: 'user_1',
          description: 'test action',
          severity: 'critical',
          ip: '127.0.0.1',
          userAgent: 'test-agent',
        }),
      })
    })

    it('skips when tenantId is null', async () => {
      const create = vi.fn().mockResolvedValue({})
      const prisma = mockPrisma(create)
      const ctx = {
        userId: 'user_1',
        userEmail: 'test@example.com',
        tenantId: null,
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      }

      await logAudit(prisma, ctx, { action: 'TEST', entity: 'User' })

      expect(create).not.toHaveBeenCalled()
    })

    it('does not throw on audit log failure', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const create = vi.fn().mockRejectedValue(new Error('db error'))
      const prisma = mockPrisma(create)
      const ctx = {
        userId: 'user_1',
        userEmail: 'test@example.com',
        tenantId: 'tenant_1',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      }

      await expect(logAudit(prisma, ctx, { action: 'TEST', entity: 'User' })).resolves.toBeUndefined()
      expect(create).toHaveBeenCalled()

      consoleError.mockRestore()
    })

    it('defaults severity to info', async () => {
      const create = vi.fn().mockResolvedValue({})
      const prisma = mockPrisma(create)
      const ctx = {
        userId: 'user_1',
        userEmail: 'test@example.com',
        tenantId: 'tenant_1',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      }

      await logAudit(prisma, ctx, { action: 'TEST', entity: 'User' })

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ severity: 'info' }),
        })
      )
    })
  })
})
