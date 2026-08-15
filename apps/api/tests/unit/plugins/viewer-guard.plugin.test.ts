import { describe, it, expect } from 'vitest'
import { viewerReadOnlyHook } from '../../../src/plugins/viewer-guard.plugin.js'

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

function mockReq(overrides: { method?: string; url?: string; role?: string | null }) {
  return {
    method: overrides.method ?? 'POST',
    url: overrides.url ?? '/api/companies',
    user: overrides.role === null ? undefined : { id: 'user_1', role: overrides.role ?? 'VIEWER' },
  } as never
}

describe('viewer-guard.plugin (P1-3: VIEWER 全局只读)', () => {
  it('blocks VIEWER write methods on /api business routes with 403', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const reply = mockReply()
      await viewerReadOnlyHook(mockReq({ method }), reply as never)
      expect(reply.getSent().statusCode).toBe(403)
      expect(reply.getSent().payload).toEqual({ success: false, error: '只读账号无写权限' })
    }
  })

  it('allows VIEWER read methods (GET)', async () => {
    const reply = mockReply()
    await viewerReadOnlyHook(mockReq({ method: 'GET' }), reply as never)
    expect(reply.getSent().payload).toBeUndefined()
  })

  it('allows VIEWER writes under /api/auth (login/logout not blocked)', async () => {
    const reply = mockReply()
    await viewerReadOnlyHook(mockReq({ method: 'POST', url: '/api/auth/login' }), reply as never)
    expect(reply.getSent().payload).toBeUndefined()
  })

  it('does not block non-/api routes', async () => {
    const reply = mockReply()
    await viewerReadOnlyHook(mockReq({ method: 'POST', url: '/health' }), reply as never)
    expect(reply.getSent().payload).toBeUndefined()
  })

  it('does not block non-VIEWER roles', async () => {
    for (const role of ['SALES', 'TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD']) {
      const reply = mockReply()
      await viewerReadOnlyHook(mockReq({ role }), reply as never)
      expect(reply.getSent().payload).toBeUndefined()
    }
  })

  it('no-ops when req.user is missing (auth runs first and already rejected)', async () => {
    const reply = mockReply()
    await viewerReadOnlyHook(mockReq({ role: null }), reply as never)
    expect(reply.getSent().payload).toBeUndefined()
  })
})
