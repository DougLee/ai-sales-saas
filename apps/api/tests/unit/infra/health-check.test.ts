import { describe, it, expect, vi, beforeEach } from 'vitest'
import { performHealthCheck } from '../../../src/infra/health-check.js'
import { prisma } from '../../../src/config/database.js'
import { Redis } from 'ioredis'
import { getPackageVersion } from '../../../src/lib/version.js'

vi.mock('../../../src/config/database.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}))

const mockRedis = {
  connect: vi.fn(),
  ping: vi.fn(),
  quit: vi.fn(),
}

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => mockRedis),
}))

describe('performHealthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok when database and redis are healthy', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }])
    mockRedis.connect.mockResolvedValue(undefined)
    mockRedis.ping.mockResolvedValue('PONG')
    mockRedis.quit.mockResolvedValue(undefined)

    const result = await performHealthCheck()

    expect(result.status).toBe('ok')
    expect(result.checks.database.ok).toBe(true)
    expect(result.checks.redis.ok).toBe(true)
    expect(result.version).toBe(getPackageVersion())
  })

  it('returns error when database fails', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('DB down'))
    mockRedis.connect.mockResolvedValue(undefined)
    mockRedis.ping.mockResolvedValue('PONG')

    const result = await performHealthCheck()

    expect(result.status).toBe('error')
    expect(result.checks.database.ok).toBe(false)
    expect(result.checks.database.error).toBe('DB down')
    expect(result.checks.redis.ok).toBe(true)
  })

  it('returns error when redis fails', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }])
    mockRedis.connect.mockRejectedValue(new Error('Redis down'))

    const result = await performHealthCheck()

    expect(result.status).toBe('error')
    expect(result.checks.database.ok).toBe(true)
    expect(result.checks.redis.ok).toBe(false)
    expect(result.checks.redis.error).toBe('Redis down')
  })
})
