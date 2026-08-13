import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MethodologyService, loadMethodologyConfig } from '../../../src/methodology/methodology.service.js'
import { DEFAULT_CONFIGS } from '../../../src/methodology/methodology-seed.js'

function createMockPrisma() {
  return {
    methodologyConfig: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  } as never
}

describe('MethodologyService', () => {
  it('lists active configs by tenant and fills missing defaults', async () => {
    const prisma = createMockPrisma()
    const service = new MethodologyService(prisma)
    const existing = [{ id: '1', moduleType: 'SPIN' }]
    vi.mocked(prisma.methodologyConfig.findMany).mockResolvedValue(existing as never)

    const result = await service.list('tenant_1')

    expect(result).toHaveLength(7)
    expect(result[0]).toEqual(existing[0])
    const defaultTypes = result.slice(1).map((c: any) => c.moduleType)
    expect(defaultTypes).toEqual(DEFAULT_CONFIGS.filter((c) => c.moduleType !== 'SPIN').map((c) => c.moduleType))
    expect(prisma.methodologyConfig.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_1', isActive: true },
      orderBy: { updatedAt: 'desc' },
    })
  })

  it('returns default configs when tenant has none', async () => {
    const prisma = createMockPrisma()
    const service = new MethodologyService(prisma)
    vi.mocked(prisma.methodologyConfig.findMany).mockResolvedValue([] as never)

    const result = await service.list('tenant_1')

    expect(result).toHaveLength(7)
    expect(result.map((c: any) => c.moduleType)).toEqual(DEFAULT_CONFIGS.map((c) => c.moduleType))
    result.forEach((c: any) => {
      expect(c.id).toMatch(/^default-/)
      expect(c.version).toBe('seed')
      expect(c.isActive).toBe(true)
    })
  })

  it('gets active config by tenant and moduleType', async () => {
    const prisma = createMockPrisma()
    const service = new MethodologyService(prisma)
    const config = { id: '1', moduleType: 'SPIN' }
    vi.mocked(prisma.methodologyConfig.findFirst).mockResolvedValue(config as never)

    const result = await service.get('tenant_1', 'SPIN')

    expect(result).toEqual(config)
    expect(prisma.methodologyConfig.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_1', moduleType: 'SPIN', isActive: true },
      orderBy: { updatedAt: 'desc' },
    })
  })

  it('falls back to default config when none found', async () => {
    const prisma = createMockPrisma()
    const service = new MethodologyService(prisma)
    vi.mocked(prisma.methodologyConfig.findFirst).mockResolvedValue(null as never)

    const result = await service.get('tenant_1', 'MILESTONE')

    expect(result).not.toBeNull()
    expect((result as any).moduleType).toBe('MILESTONE')
    expect((result as any).id).toBe('default-MILESTONE')
    expect((result as any).configJson).toHaveProperty('stages')
    expect((result as any).configJson).toHaveProperty('gateRules')
  })

  it('creates config and deactivates old ones', async () => {
    const prisma = createMockPrisma()
    const service = new MethodologyService(prisma)
    const input = {
      moduleType: 'SPIN',
      configJson: {
        situation: { prompt: 'situation', examples: [] },
        problem: { prompt: 'problem', examples: [] },
        implication: { prompt: 'implication', examples: [] },
        needPayoff: { prompt: 'needPayoff', examples: [] },
      },
    }
    const created = { id: '2', ...input }
    vi.mocked(prisma.methodologyConfig.create).mockResolvedValue(created as never)

    const result = await service.create('tenant_1', input as never)

    expect(prisma.methodologyConfig.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_1', moduleType: 'SPIN' },
      data: { isActive: false },
    })
    expect(prisma.methodologyConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant_1',
          moduleType: 'SPIN',
          configJson: input.configJson,
          isActive: true,
        }),
      })
    )
    expect(result).toEqual(created)
  })
})

describe('loadMethodologyConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns existing config when found', async () => {
    const prisma = createMockPrisma()
    const config = { id: '1', moduleType: 'MILESTONE', configJson: { stages: [] } }
    vi.mocked(prisma.methodologyConfig.findFirst).mockResolvedValue(config as never)

    const result = await loadMethodologyConfig(prisma, 'tenant_1', 'MILESTONE')
    expect(result).toEqual(config)
  })

  it('falls back to shared constants for MILESTONE', async () => {
    const prisma = createMockPrisma()
    vi.mocked(prisma.methodologyConfig.findFirst).mockResolvedValue(null as never)

    const result = await loadMethodologyConfig(prisma, 'tenant_1', 'MILESTONE')
    expect(result.moduleType).toBe('MILESTONE')
    expect(result.configJson).toHaveProperty('stages')
    expect(result.configJson).toHaveProperty('gateRules')
  })

  it('falls back to shared constants for SPIN', async () => {
    const prisma = createMockPrisma()
    vi.mocked(prisma.methodologyConfig.findFirst).mockResolvedValue(null as never)

    const result = await loadMethodologyConfig(prisma, 'tenant_1', 'SPIN')
    expect(result.moduleType).toBe('SPIN')
    expect(result.configJson).toHaveProperty('situation')
    expect(result.configJson).toHaveProperty('problem')
    expect(result.configJson).toHaveProperty('implication')
    expect(result.configJson).toHaveProperty('needPayoff')
  })

  it('falls back for all supported module types', async () => {
    const types = ['HUMAN_INFO', 'SALES_PLAYBOOK', 'DEMAND_MINING', 'PERSONALITY_ANALYSIS', 'FOLLOW_UP'] as const
    for (const moduleType of types) {
      const prisma = createMockPrisma()
      vi.mocked(prisma.methodologyConfig.findFirst).mockResolvedValue(null as never)
      const result = await loadMethodologyConfig(prisma, 'tenant_1', moduleType)
      expect(result.moduleType).toBe(moduleType)
    }
  })
})
