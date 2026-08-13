import { describe, it, expect, vi } from 'vitest'
import { SkillRegistry } from '../../../../src/agents/skills/skill-registry.js'
import { z } from 'zod'

function createMockSkill(id: string, category: 'search' | 'query' | 'action' | 'analysis' = 'search') {
  return {
    id,
    name: id,
    description: 'desc',
    category,
    readOnly: true,
    inputSchema: z.object({ q: z.string() }),
    outputSchema: z.object({ result: z.string() }),
    execute: vi.fn(),
  }
}

describe('SkillRegistry', () => {
  it('registers and gets skill', () => {
    const registry = new SkillRegistry()
    const skill = createMockSkill('s1')
    registry.register(skill as never)
    expect(registry.get('s1')).toBe(skill)
  })

  it('throws on duplicate registration', () => {
    const registry = new SkillRegistry()
    const skill = createMockSkill('s1')
    registry.register(skill as never)
    expect(() => registry.register(skill as never)).toThrow('already registered')
  })

  it('lists skills', () => {
    const registry = new SkillRegistry()
    const skill = createMockSkill('s1')
    registry.register(skill as never)
    expect(registry.list()).toHaveLength(1)
  })

  it('lists skills by category', () => {
    const registry = new SkillRegistry()
    registry.register(createMockSkill('s1', 'search') as never)
    registry.register(createMockSkill('s2', 'action') as never)
    expect(registry.listByCategory('search')).toHaveLength(1)
    expect(registry.listByCategory('action')).toHaveLength(1)
  })

  it('returns error when skill not found', async () => {
    const registry = new SkillRegistry()
    const result = await registry.execute('missing', {}, { tenantId: 't1', userId: 'u1', role: 'SALES', prisma: {} as never })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('SKILL_NOT_FOUND')
  })

  it('returns validation error for invalid input', async () => {
    const registry = new SkillRegistry()
    const skill = createMockSkill('s1')
    registry.register(skill as never)
    const result = await registry.execute('s1', { q: 123 }, { tenantId: 't1', userId: 'u1', role: 'SALES', prisma: {} as never })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('VALIDATION_ERROR')
  })

  it('executes skill and validates output', async () => {
    const registry = new SkillRegistry()
    const skill = createMockSkill('s1')
    skill.execute.mockResolvedValue({ success: true, data: { result: 'ok' } })
    registry.register(skill as never)
    const result = await registry.execute('s1', { q: 'hello' }, { tenantId: 't1', userId: 'u1', role: 'SALES', prisma: {} as never })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ result: 'ok' })
  })

  it('returns output validation error when output invalid', async () => {
    const registry = new SkillRegistry()
    const skill = createMockSkill('s1')
    skill.execute.mockResolvedValue({ success: true, data: { wrong: 'output' } })
    registry.register(skill as never)
    const result = await registry.execute('s1', { q: 'hello' }, { tenantId: 't1', userId: 'u1', role: 'SALES', prisma: {} as never })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('OUTPUT_VALIDATION_ERROR')
  })

  it('catches execution errors', async () => {
    const registry = new SkillRegistry()
    const skill = createMockSkill('s1')
    skill.execute.mockRejectedValue(new Error('boom'))
    registry.register(skill as never)
    const result = await registry.execute('s1', { q: 'hello' }, { tenantId: 't1', userId: 'u1', role: 'SALES', prisma: {} as never })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('EXECUTION_ERROR')
  })
})
