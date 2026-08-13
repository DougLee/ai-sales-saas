import { describe, it, expect, vi } from 'vitest'
import { requireRoles } from '../../../src/plugins/rbac.plugin.js'

describe('rbac.plugin', () => {
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

  it('allows access for matching role', async () => {
    const middleware = requireRoles('SALES', 'TENANT_ADMIN')
    const req = { tenantContext: { role: 'SALES' } } as never
    const reply = mockReply()
    await middleware(req, reply as never)
    expect(reply.getSent().payload).toBeUndefined()
  })

  it('returns 401 when tenantContext missing', async () => {
    const middleware = requireRoles('SALES')
    const req = {} as never
    const reply = mockReply()
    await middleware(req, reply as never)
    expect(reply.getSent().statusCode).toBe(401)
    expect((reply.getSent().payload as { error: { code: string } }).error.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 for non-matching role', async () => {
    const middleware = requireRoles('TENANT_ADMIN')
    const req = { tenantContext: { role: 'SALES' } } as never
    const reply = mockReply()
    await middleware(req, reply as never)
    expect(reply.getSent().statusCode).toBe(403)
    expect((reply.getSent().payload as { error: { code: string } }).error.code).toBe('FORBIDDEN')
  })
})
