import { describe, it, expect, vi } from 'vitest'
import { buildSystemPrompt } from '../../../../src/agents/core/prompt-builder.js'

vi.mock('../../../../src/config/database.js', () => ({
  prisma: {},
}))

vi.mock('../../../../src/methodology/methodology.service.js', () => ({
  loadMethodologyConfig: vi.fn().mockResolvedValue(null),
}))

describe('prompt-builder', () => {
  it('describes available data sources instead of callable tools', async () => {
    const system = await buildSystemPrompt({
      intent: { intent: 'visit_analysis', confidence: 0.9, parameters: {} },
      userRole: 'SALES',
      tenantId: 'tenant_1',
      availableTools: ['project-query', 'visit-query', 'visit-analysis', 'kb-search'],
    })

    expect(system).toContain('【可用数据源】')
    expect(system).toContain('已由系统自动检索并注入')
    expect(system).not.toContain('你拥有以上工具的使用权')
    expect(system).not.toContain('自主判断需要调用哪些工具')
  })

  it('omits data source section when no tools available', async () => {
    const system = await buildSystemPrompt({
      intent: { intent: 'general_chat', confidence: 0.9, parameters: {} },
      userRole: 'SALES',
      tenantId: 'tenant_1',
      availableTools: [],
    })

    expect(system).not.toContain('【可用数据源】')
  })
})
