import { describe, it, expect, vi } from 'vitest'
import { registerGlobalRateLimit, registerAgentRateLimit } from '../../../src/plugins/rate-limit.plugin.js'

vi.mock('@fastify/rate-limit', () => ({
  default: vi.fn(),
}))

vi.mock('ioredis', () => ({
  Redis: vi.fn(),
}))

describe('rate-limit.plugin', () => {
  function mockApp() {
    return {
      register: vi.fn().mockResolvedValue(undefined),
    } as never
  }

  it('registers global rate limit', async () => {
    const app = mockApp()
    await registerGlobalRateLimit(app)
    expect(app.register).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        max: expect.any(Number),
        timeWindow: expect.any(Number),
        keyGenerator: expect.any(Function),
        errorResponseBuilder: expect.any(Function),
      })
    )
  })

  it('registers agent rate limit', async () => {
    const app = mockApp()
    await registerAgentRateLimit(app)
    expect(app.register).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        max: expect.any(Number),
        timeWindow: expect.any(Number),
        keyGenerator: expect.any(Function),
        errorResponseBuilder: expect.any(Function),
      })
    )
  })

  it('keyGenerator uses userId when available', async () => {
    const app = mockApp()
    await registerGlobalRateLimit(app)
    const options = vi.mocked(app.register).mock.calls[0][1] as { keyGenerator: (req: unknown) => string }
    const req = { user: { id: 'user_1' }, url: '/api/test', ip: '127.0.0.1' }
    expect(options.keyGenerator(req)).toBe('rl:user:user_1:/api/test')
  })

  it('keyGenerator falls back to IP when user missing', async () => {
    const app = mockApp()
    await registerGlobalRateLimit(app)
    const options = vi.mocked(app.register).mock.calls[0][1] as { keyGenerator: (req: unknown) => string }
    const req = { user: undefined, url: '/api/test', ip: '127.0.0.1' }
    expect(options.keyGenerator(req)).toBe('rl:ip:127.0.0.1:/api/test')
  })

  it('errorResponseBuilder returns structured error', async () => {
    const app = mockApp()
    await registerGlobalRateLimit(app)
    const options = vi.mocked(app.register).mock.calls[0][1] as {
      errorResponseBuilder: (req: unknown, context: { max: number; after: string; ttl: number }) => unknown
    }
    const req = { id: 'req-1' }
    const context = { max: 100, after: '5000', ttl: 60000 }
    const result = options.errorResponseBuilder(req, context)
    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: 'RATE_LIMIT_ERROR',
        details: { limit: 100, retryAfter: 5000, ttl: 60000 },
      }),
    })
  })
})
