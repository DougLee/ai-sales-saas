import { describe, it, expect, vi } from 'vitest'
import { DecisionChainService, migrateLegacyDecisionMap } from '../../../../src/crm/projects/decision-chain.service.js'

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    project: {
      findFirst: vi.fn().mockResolvedValue({
        decisionMap: {},
        tenantId: 'tenant_1',
        company: { name: '测试公司' },
        contacts: [],
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    projectContact: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args: { data: { contactId: string; projectId: string; role: string; attitude: string } }) =>
        Promise.resolve({ id: `pc_${args.data.contactId}`, ...args.data }),
      ),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    contact: {
      create: vi.fn().mockImplementation((args: { data: { name: string } }) =>
        Promise.resolve({ id: `contact_${args.data.name}`, ...args.data }),
      ),
    },
    ...overrides,
  } as unknown as Parameters<typeof DecisionChainService>[0]
}

describe('migrateLegacyDecisionMap', () => {
  it('returns empty map for null', () => {
    const result = migrateLegacyDecisionMap(null)
    expect(result.nodes).toHaveLength(0)
    expect(result.relations).toHaveLength(0)
  })

  it('passes through standard decision map', () => {
    const standard = {
      nodes: [{ id: 'n1', name: '张三', role: 'DECISION_MAKER', attitude: 'supportive' }],
      relations: [],
    }
    const result = migrateLegacyDecisionMap(standard)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].name).toBe('张三')
  })

  it('migrates legacy contact map', () => {
    const legacy = {
      contact_0: { name: '李四', role: 'COACH', attitude: '支持' },
      contact_1: { name: '王五', role: '决策者', attitude: 'neutral' },
    }
    const result = migrateLegacyDecisionMap(legacy)
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes[0].role).toBe('COACH')
    expect(result.nodes[1].role).toBe('DECISION_MAKER')
    expect(result.nodes[0].attitude).toBe('supportive')
  })

  it('skips array values like the relations storage key (no junk nodes)', () => {
    const stored = { relations: [{ sourceId: 'a', targetId: 'b', relation: 'reports_to' }] }
    const result = migrateLegacyDecisionMap(stored)
    expect(result.nodes).toHaveLength(0)
  })
})

describe('DecisionChainService', () => {
  it('returns normalized map with summary from legacy decisionMap', async () => {
    const prisma = createMockPrisma({
      project: {
        findFirst: vi.fn().mockResolvedValue({
          decisionMap: {
            nodes: [
              { id: 'n1', name: '张三', role: 'DECISION_MAKER', attitude: 'supportive' },
              { id: 'n2', name: '李四', role: 'COACH', attitude: 'neutral' },
            ],
            relations: [],
          },
          contacts: [],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    })
    const service = new DecisionChainService(prisma)

    const result = await service.get('proj_1')

    expect(result.map.nodes).toHaveLength(2)
    expect(result.summary.nodeCount).toBe(2)
    expect(result.summary.decisionMakerCount).toBe(1)
    expect(result.summary.coachCount).toBe(1)
    expect(result.summary.coverageScore).toBeGreaterThan(0)
  })

  it('returns map from ProjectContact when available', async () => {
    const prisma = createMockPrisma({
      project: {
        findFirst: vi.fn().mockResolvedValue({
          decisionMap: {},
          contacts: [
            {
              id: 'pc_1',
              contactId: 'c_1',
              role: 'DECISION_MAKER',
              attitude: 'SUPPORTIVE',
              contact: { name: '张三', position: '院长', department: '信息中心', phone: '13800000000', email: 'zhang@example.com' },
            },
          ],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    })
    const service = new DecisionChainService(prisma)

    const result = await service.get('proj_1')

    expect(result.map.nodes).toHaveLength(1)
    expect(result.map.nodes[0].contactId).toBe('c_1')
    expect(result.map.nodes[0].name).toBe('张三')
    expect(result.map.nodes[0].attitude).toBe('supportive')
  })

  it('creates ProjectContact for existing contact on update', async () => {
    const prisma = createMockPrisma()
    const service = new DecisionChainService(prisma)

    await service.update('proj_1', {
      nodes: [{ id: 'n1', contactId: 'c_1', name: '张三', role: 'DECISION_MAKER', attitude: 'supportive' }],
      relations: [],
    })

    expect(prisma.projectContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactId: 'c_1', projectId: 'proj_1', role: 'DECISION_MAKER' }),
      }),
    )
  })

  it('creates new contact and ProjectContact when contactId missing', async () => {
    const prisma = createMockPrisma()
    const service = new DecisionChainService(prisma)

    await service.update('proj_1', {
      nodes: [{ id: 'n1', name: '张三', title: '院长', department: '信息中心', role: 'DECISION_MAKER', attitude: 'supportive' }],
      relations: [],
    })

    expect(prisma.contact.create).toHaveBeenCalled()
    expect(prisma.projectContact.create).toHaveBeenCalled()
  })

  it('persists relations into decisionMap JSON with ids rewritten to ProjectContact ids', async () => {
    const prisma = createMockPrisma()
    const service = new DecisionChainService(prisma)

    // n1 走已有联系人（落库 pc_c_1），n2 新建联系人（落库 pc_contact_李四）
    await service.update('proj_1', {
      nodes: [
        { id: 'n1', contactId: 'c_1', name: '张三', role: 'EVALUATOR', attitude: 'neutral' },
        { id: 'n2', name: '李四', role: 'DECISION_MAKER', attitude: 'unknown' },
      ],
      relations: [{ sourceId: 'n1', targetId: 'n2', relation: 'reports_to' }],
    })

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          decisionMap: {
            nodes: [
              expect.objectContaining({ id: 'pc_c_1', contactId: 'c_1', name: '张三', role: 'EVALUATOR' }),
              expect.objectContaining({ id: 'pc_contact_李四', name: '李四', role: 'DECISION_MAKER' }),
            ],
            relations: [{ sourceId: 'pc_c_1', targetId: 'pc_contact_李四', relation: 'reports_to' }],
          },
        },
      }),
    )
  })

  it('syncs nodes back into decisionMap so the M6 gate can read them (P0-2)', async () => {
    const prisma = createMockPrisma()
    const service = new DecisionChainService(prisma)

    await service.update('proj_1', {
      nodes: [{ id: 'n1', contactId: 'c_1', name: '张三', role: 'DECISION_MAKER', attitude: 'supportive' }],
      relations: [],
    })

    const updateCall = (prisma.project.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { decisionMap: { nodes: Array<Record<string, unknown>> } }
    }
    expect(Array.isArray(updateCall.data.decisionMap.nodes)).toBe(true)
    expect(updateCall.data.decisionMap.nodes).toHaveLength(1)
    expect(updateCall.data.decisionMap.nodes[0]).toMatchObject({ id: 'pc_c_1', name: '张三', role: 'DECISION_MAKER' })
  })

  it('drops dangling relations on update', async () => {
    const prisma = createMockPrisma()
    const service = new DecisionChainService(prisma)

    await service.update('proj_1', {
      nodes: [{ id: 'n1', contactId: 'c_1', name: '张三', role: 'EVALUATOR', attitude: 'neutral' }],
      relations: [{ sourceId: 'n1', targetId: 'deleted_node', relation: 'opposes' }],
    })

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          decisionMap: {
            nodes: [expect.objectContaining({ id: 'pc_c_1' })],
            relations: [],
          },
        },
      }),
    )
  })

  it('get returns stored relations filtered to existing nodes', async () => {
    const pc = (id: string, name: string) => ({
      id,
      contactId: `c_${id}`,
      role: 'EVALUATOR',
      attitude: 'NEUTRAL',
      contact: { name, position: null, department: null, phone: null, email: null },
    })
    const prisma = createMockPrisma({
      project: {
        findFirst: vi.fn().mockResolvedValue({
          decisionMap: {
            relations: [
              { sourceId: 'pc_1', targetId: 'pc_2', relation: 'reports_to' },
              { sourceId: 'pc_1', targetId: 'pc_gone', relation: 'opposes' },
            ],
          },
          contacts: [pc('pc_1', '张三'), pc('pc_2', '李四')],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    })
    const service = new DecisionChainService(prisma)

    const result = await service.get('proj_1')

    expect(result.map.relations).toEqual([{ sourceId: 'pc_1', targetId: 'pc_2', relation: 'reports_to' }])
  })
})
