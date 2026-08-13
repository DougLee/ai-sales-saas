import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFns = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
}

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: mockFns.get,
    setex: mockFns.setex,
    del: mockFns.del,
  })),
}))

// 动态导入被测模块，确保 mock 先注册
const { SessionService } = await import('../../../src/session/session.service.js')

describe('SessionService', () => {
  let service: SessionService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new SessionService()
  })

  it('creates session without kicking existing', async () => {
    mockFns.get.mockResolvedValue(null)

    const result = await service.createSession('user-1', 'token-a')

    expect(mockFns.setex).toHaveBeenCalledWith('auth:session:user-1', 60 * 60 * 24 * 7, 'token-a')
    expect(result).toEqual({})
  })

  it('creates session and reports kicked token', async () => {
    mockFns.get.mockResolvedValue('token-old')

    const result = await service.createSession('user-1', 'token-new')

    expect(result).toEqual({ kicked: 'token-old' })
  })

  it('validates matching session', async () => {
    mockFns.get.mockResolvedValue('token-a')

    const valid = await service.validateSession('user-1', 'token-a')
    expect(valid).toBe(true)
  })

  it('rejects non-matching session', async () => {
    mockFns.get.mockResolvedValue('token-a')

    const valid = await service.validateSession('user-1', 'token-b')
    expect(valid).toBe(false)
  })

  it('destroys session', async () => {
    await service.destroySession('user-1')
    expect(mockFns.del).toHaveBeenCalledWith('auth:session:user-1')
  })
})
