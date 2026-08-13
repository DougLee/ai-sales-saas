import { describe, it, expect, vi, beforeEach } from 'vitest'
import fp from 'fastify-plugin'

vi.mock('fastify-plugin', () => ({
  default: vi.fn().mockImplementation((fn) => fn),
}))

vi.mock('../../../src/session/session.service.js', () => ({
  sessionService: {
    validateSession: vi.fn(),
  },
}))

import { authPlugin } from '../../../src/plugins/auth.plugin.js'
import { sessionService } from '../../../src/session/session.service.js'

describe('auth.plugin', () => {
  let hooks: Record<string, Function>
  let app: { addHook: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    hooks = {}
    app = {
      addHook: vi.fn().mockImplementation((name: string, fn: Function) => {
        hooks[name] = fn
      }),
    }
    authPlugin(app as never)
  })

  function mockReq(overrides?: Record<string, unknown>) {
    const user = overrides?.user ?? { id: 'user_1', tenantId: 'tenant_1', email: 'test@example.com' }
    return {
      url: '/api/test',
      user,
      jwtVerify: vi.fn().mockImplementation(async function (this: typeof req) {
        this.user = user
        return undefined
      }),
      headers: { authorization: 'Bearer token-123' },
      ...overrides,
    }
  }

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

  it('allows public paths', async () => {
    const req = mockReq({ url: '/api/auth/login' })
    const reply = mockReply()
    await hooks.onRequest(req as never, reply as never)
    expect(reply.getSent().payload).toBeUndefined()
  })

  it('validates session for authenticated user', async () => {
    vi.mocked(sessionService.validateSession).mockResolvedValue(true)
    const req = mockReq()
    const reply = mockReply()
    await hooks.onRequest(req as never, reply as never)
    expect(sessionService.validateSession).toHaveBeenCalledWith('user_1', 'token-123')
    expect(reply.getSent().payload).toBeUndefined()
  })

  it('returns 401 when session invalid', async () => {
    vi.mocked(sessionService.validateSession).mockResolvedValue(false)
    const req = mockReq()
    const reply = mockReply()
    await hooks.onRequest(req as never, reply as never)
    expect(reply.getSent().statusCode).toBe(401)
    expect((reply.getSent().payload as { error: { code: string } }).error.code).toBe('SESSION_EXPIRED')
  })

  it('returns 401 when jwtVerify throws', async () => {
    const req = mockReq({ jwtVerify: vi.fn().mockRejectedValue(new Error('invalid')) })
    const reply = mockReply()
    await hooks.onRequest(req as never, reply as never)
    expect(reply.getSent().statusCode).toBe(401)
    expect((reply.getSent().payload as { error: { code: string } }).error.code).toBe('UNAUTHORIZED')
  })
})
