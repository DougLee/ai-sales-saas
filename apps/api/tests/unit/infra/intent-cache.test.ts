import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
}))

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => mockRedis),
}))

import { getIntentCacheKey, getCachedIntent, setCachedIntent, clearIntentCache } from '../../../src/agents/core/intent-cache.js'

describe('intent-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates deterministic cache key', () => {
    const key1 = getIntentCacheKey('hello')
    const key2 = getIntentCacheKey('hello')
    expect(key1).toBe(key2)
    expect(key1.startsWith('intent:')).toBe(true)
  })

  it('returns null when cache miss', async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getCachedIntent('hello')
    expect(result).toBeNull()
  })

  it('returns parsed intent when cache hit', async () => {
    const cached = { intent: 'test', confidence: 0.9, parameters: {} }
    mockRedis.get.mockResolvedValue(JSON.stringify(cached))
    const result = await getCachedIntent('hello')
    expect(result).toEqual(cached)
  })

  it('returns null on parse error', async () => {
    mockRedis.get.mockResolvedValue('invalid-json')
    const result = await getCachedIntent('hello')
    expect(result).toBeNull()
  })

  it('sets cache with TTL', async () => {
    const value = { intent: 'test', confidence: 0.9, parameters: {} }
    await setCachedIntent('hello', value)
    expect(mockRedis.setex).toHaveBeenCalledWith(
      expect.stringContaining('intent:'),
      3600,
      JSON.stringify(value)
    )
  })

  it('clears cache', async () => {
    await clearIntentCache('hello')
    expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining('intent:'))
  })

  it('cache key includes tenantId for isolation', () => {
    const keyA = getIntentCacheKey('hello', 'tenant_a')
    const keyB = getIntentCacheKey('hello', 'tenant_b')
    const keyDefault = getIntentCacheKey('hello')
    expect(keyA).not.toBe(keyB)
    expect(keyA).toContain('tenant_a')
    expect(keyDefault).toContain('default')
  })

  it('passes tenant-scoped key to redis', async () => {
    const value = { intent: 'test', confidence: 0.9, parameters: {} }
    await setCachedIntent('hello', value, 'tenant_a')
    expect(mockRedis.setex).toHaveBeenCalledWith(
      expect.stringContaining('tenant_a'),
      3600,
      JSON.stringify(value)
    )
  })
})
