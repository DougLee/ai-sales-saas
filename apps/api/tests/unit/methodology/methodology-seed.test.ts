import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureDefaultConfigs } from '../../../src/methodology/methodology-seed.js'
import type { PrismaClient } from '@prisma/client'

function createMockPrisma() {
  const configs: Array<{
    id: string
    tenantId: string
    moduleType: string
    version: string
    isActive: boolean
    configJson: unknown
  }> = []
  let idCounter = 1

  return {
    methodologyConfig: {
      findFirst: vi.fn(({ where }) => {
        const found = configs.find(
          (c) =>
            c.tenantId === where.tenantId &&
            c.moduleType === where.moduleType &&
            c.isActive === where.isActive
        )
        return Promise.resolve(found ?? null)
      }),
      create: vi.fn(({ data }) => {
        const record = { ...data, id: `cfg-${idCounter++}` }
        configs.push(record)
        return Promise.resolve(record)
      }),
    },
  } as unknown as PrismaClient
}

describe('ensureDefaultConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates all 7 default configs on first call', async () => {
    const prisma = createMockPrisma()
    await ensureDefaultConfigs(prisma, 'tenant-1')

    expect(prisma.methodologyConfig.create).toHaveBeenCalledTimes(7)
    const moduleTypes = vi.mocked(prisma.methodologyConfig.create).mock.calls.map(
      (call) => (call[0] as { data: { moduleType: string } }).data.moduleType
    )
    expect(moduleTypes).toEqual(
      expect.arrayContaining([
        'MILESTONE',
        'SPIN',
        'HUMAN_INFO',
        'SALES_PLAYBOOK',
        'DEMAND_MINING',
        'PERSONALITY_ANALYSIS',
        'FOLLOW_UP',
      ])
    )

    const firstCall = vi.mocked(prisma.methodologyConfig.create).mock.calls[0][0] as {
      data: { version: string; isActive: boolean }
    }
    expect(firstCall.data.version).toBe('seed')
    expect(firstCall.data.isActive).toBe(true)
  })

  it('is idempotent on second call', async () => {
    const prisma = createMockPrisma()
    await ensureDefaultConfigs(prisma, 'tenant-1')
    await ensureDefaultConfigs(prisma, 'tenant-1')

    expect(prisma.methodologyConfig.create).toHaveBeenCalledTimes(7)
  })

  it('skips module types that already have an active config', async () => {
    const prisma = createMockPrisma()

    // 预置一条 MILESTONE 配置
    await (prisma.methodologyConfig.create as ReturnType<typeof vi.fn>)(
      {
        data: {
          tenantId: 'tenant-1',
          moduleType: 'MILESTONE',
          configJson: { custom: true },
          version: 'custom',
          isActive: true,
        },
      }
    )

    await ensureDefaultConfigs(prisma, 'tenant-1')

    expect(prisma.methodologyConfig.create).toHaveBeenCalledTimes(6 + 1)
  })
})
