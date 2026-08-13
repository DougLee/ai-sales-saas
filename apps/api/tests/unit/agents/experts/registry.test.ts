import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/infra/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

describe('expert registry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function loadRegistry() {
    return import('../../../../src/agents/experts/registry.js')
  }

  it('registers and finds expert', async () => {
    const { registerExpert, findExpert, listExperts } = await loadRegistry()
    const expert = {
      intent: 'test_intent',
      label: 'Test Expert',
      systemPrompt: 'prompt',
      outputSchema: {},
      toolPreferences: [],
      maxSteps: 1,
    } as never
    registerExpert(expert)
    expect(findExpert('test_intent')).toBe(expert)
    expect(listExperts()).toContain(expert)
  })

  it('throws when registering duplicate intent', async () => {
    const { registerExpert } = await loadRegistry()
    const expert = {
      intent: 'dup_intent',
      label: 'Dup',
      systemPrompt: 'prompt',
      outputSchema: {},
      toolPreferences: [],
      maxSteps: 1,
    } as never
    registerExpert(expert)
    expect(() => registerExpert(expert)).toThrow('already registered')
  })

  it('returns undefined for unregistered intent', async () => {
    const { findExpert } = await loadRegistry()
    expect(findExpert('missing')).toBeUndefined()
  })

  it('loads all expert modules', async () => {
    const { loadAllExperts, listExperts } = await loadRegistry()
    await loadAllExperts()
    const experts = listExperts()
    expect(experts.length).toBeGreaterThan(0)
    const intents = experts.map((e) => e.intent)
    expect(intents).toContain('follow_up')
    expect(intents).toContain('demand_mining')
    expect(intents).toContain('visit_preparation')
  })
})
