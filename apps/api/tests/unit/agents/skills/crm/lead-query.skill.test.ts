import { describe, it, expect, vi } from 'vitest'
import { leadQuerySkill } from '../../../../../src/agents/skills/crm/lead-query.skill.js'

function createMockPrisma(leads: unknown[] = []) {
  return {
    lead: {
      findMany: vi.fn().mockResolvedValue(leads),
    },
  }
}

function createContext(prisma: unknown) {
  return {
    prisma,
    userId: 'user_1',
    tenantId: 'tenant_1',
    orgId: 'org_1',
  }
}

describe('lead-query.skill', () => {
  it('returns all leads when no keyword', async () => {
    const leads = [
      { id: 'lead_1', name: '学校A', createdAt: new Date() },
      { id: 'lead_2', name: '学校B', createdAt: new Date() },
    ]
    const prisma = createMockPrisma(leads)

    const result = await leadQuerySkill.execute({ params: {}, context: createContext(prisma) })

    expect(result.success).toBe(true)
    expect(result.data.count).toBe(2)
    expect(result.data.leads).toEqual(leads)
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 10, orderBy: { createdAt: 'desc' } }),
    )
  })

  it('applies keyword filter when provided', async () => {
    const leads = [{ id: 'lead_1', name: '学校A', createdAt: new Date() }]
    const prisma = createMockPrisma(leads)

    await leadQuerySkill.execute({ params: { keyword: '学校' }, context: createContext(prisma) })

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: '学校', mode: 'insensitive' } },
            { contactName: { contains: '学校', mode: 'insensitive' } },
          ],
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    )
  })

  it('returns empty list when no leads match', async () => {
    const prisma = createMockPrisma([])

    const result = await leadQuerySkill.execute({ params: { keyword: '不存在' }, context: createContext(prisma) })

    expect(result.success).toBe(true)
    expect(result.data.count).toBe(0)
    expect(result.data.leads).toEqual([])
  })
})
