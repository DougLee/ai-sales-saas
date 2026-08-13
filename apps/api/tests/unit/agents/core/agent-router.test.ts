import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { routeIntent, splitCompositeIntents } from '../../../../src/agents/core/agent-router.js'

const mockGenerateText = vi.fn()
const mockGetCachedIntent = vi.fn()
const mockSetCachedIntent = vi.fn()

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: (...args: unknown[]) => mockGenerateText(...args),
  }
})

vi.mock('../../../../src/agents/core/intent-cache.js', () => ({
  getCachedIntent: (...args: unknown[]) => mockGetCachedIntent(...args),
  setCachedIntent: (...args: unknown[]) => mockSetCachedIntent(...args),
}))

describe('routeIntent', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
    mockGetCachedIntent.mockReset()
    mockSetCachedIntent.mockReset()
    mockGetCachedIntent.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns intent from cache without calling LLM', async () => {
    mockGetCachedIntent.mockResolvedValue({
      intent: 'visit_analysis',
      confidence: 0.92,
      parameters: { targetName: '河南科技学院' },
    })

    const result = await routeIntent('分析一下昨天的拜访录音')

    expect(result.intent).toBe('visit_analysis')
    expect(result.confidence).toBe(0.92)
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it('returns intent from rule without calling LLM', async () => {
    const result = await routeIntent('帮我找几个目标客户')

    expect(result.intent).toBe('territory_search')
    expect(result.confidence).toBe(0.85)
    expect(mockGenerateText).not.toHaveBeenCalled()
    expect(mockSetCachedIntent).toHaveBeenCalledTimes(1)
  })

  it('caches LLM result after successful classification', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        intent: 'team_management',
        confidence: 0.85,
        entities: {},
        reasoning: '询问团队情况',
      }),
      usage: { totalTokens: 100 },
    })

    const result = await routeIntent('看看团队Pipeline')

    expect(result.intent).toBe('team_management')
    expect(mockSetCachedIntent).toHaveBeenCalledTimes(1)
    const cached = mockSetCachedIntent.mock.calls[0][1]
    expect(cached.intent).toBe('team_management')
    expect(cached.confidence).toBe(0.85)
  })

  it('parses visit_analysis intent from LLM JSON output', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        intent: 'visit_analysis',
        confidence: 0.92,
        entities: {},
        reasoning: '用户要求分析拜访录音',
      }),
      usage: { totalTokens: 100 },
    })

    const result = await routeIntent('分析一下昨天的拜访录音')
    expect(result.intent).toBe('visit_analysis')
    expect(result.confidence).toBe(0.92)
  })

  it('parses background_research intent with entities', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        intent: 'background_research',
        confidence: 0.88,
        entities: { targetName: '河南科技学院', region: '新乡' },
        reasoning: '用户提到具体客户名称',
      }),
      usage: { totalTokens: 100 },
    })

    const result = await routeIntent('调研一下河南科技学院')
    expect(result.intent).toBe('background_research')
    expect(result.parameters.targetName).toBe('河南科技学院')
  })

  it('falls back to general_chat when LLM returns invalid JSON', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'not valid json',
      usage: { totalTokens: 100 },
    })

    const result = await routeIntent('随便聊聊')
    expect(result.intent).toBe('general_chat')
    expect(result.confidence).toBe(0.3)
  })

  it('falls back to general_chat when LLM call throws', async () => {
    mockGenerateText.mockRejectedValue(new Error('API error'))

    const result = await routeIntent('今天天气怎么样')
    expect(result.intent).toBe('general_chat')
    expect(result.confidence).toBe(0.3)
  })

  it('strips markdown code block wrappers from LLM output', async () => {
    mockGenerateText.mockResolvedValue({
      text: '```json\n' + JSON.stringify({
        intent: 'team_management',
        confidence: 0.85,
        entities: {},
        reasoning: '询问团队情况',
      }) + '\n```',
      usage: { totalTokens: 100 },
    })

    const result = await routeIntent('看看团队Pipeline')
    expect(result.intent).toBe('team_management')
    expect(result.confidence).toBe(0.85)
  })

  it('rejects invalid intent values and falls back', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        intent: 'not_a_valid_intent',
        confidence: 0.9,
        entities: {},
        reasoning: '无效意图',
      }),
      usage: { totalTokens: 100 },
    })

    const result = await routeIntent('某个奇怪的问题')
    expect(result.intent).toBe('general_chat')
  })

  it('mid confidence (0.3~0.7) returns best-guess intent with assumed flag, no clarification, no cache', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        intent: 'project_health',
        confidence: 0.55,
        entities: { targetName: '河南大学' },
        reasoning: '用户问商机评分，但表达略有歧义',
      }),
      usage: { totalTokens: 100 },
    })

    const result = await routeIntent('河南大学那个商机30分咋办')

    expect(result.intent).toBe('project_health')
    expect(result.assumed).toBe(true)
    expect(result.parameters.targetName).toBe('河南大学')
    // assumed 结果不缓存，避免固化不确定分类
    expect(mockSetCachedIntent).not.toHaveBeenCalled()
  })

  it('low confidence (<0.3) falls back to clarification', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        intent: 'territory_search',
        confidence: 0.2,
        entities: {},
        reasoning: '完全摸不准',
      }),
      usage: { totalTokens: 100 },
    })

    const result = await routeIntent('那个啥来着')

    expect(result.intent).toBe('clarification')
    expect(result.entityType).toBe('territory_search')
    expect(mockSetCachedIntent).not.toHaveBeenCalled()
  })

  it('high confidence result is cached without assumed flag', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        intent: 'project_health',
        confidence: 0.9,
        entities: { targetName: '河南大学' },
        reasoning: '明确问评分提升',
      }),
      usage: { totalTokens: 100 },
    })

    const result = await routeIntent('这个项目30分还有救吗')

    expect(result.intent).toBe('project_health')
    expect(result.assumed).toBeUndefined()
    expect(mockSetCachedIntent).toHaveBeenCalledTimes(1)
  })

  it('passes tenantId to intent cache', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        intent: 'team_management',
        confidence: 0.85,
        entities: {},
        reasoning: '询问团队情况',
      }),
      usage: { totalTokens: 100 },
    })

    await routeIntent('看看团队Pipeline', { tenantId: 'tenant_a' })

    expect(mockGetCachedIntent).toHaveBeenCalledWith('看看团队Pipeline', 'tenant_a')
    expect(mockSetCachedIntent).toHaveBeenCalledWith(
      '看看团队Pipeline',
      expect.objectContaining({ intent: 'team_management' }),
      'tenant_a',
    )
  })

  it('rule hit for project_health phrasing does not call LLM', async () => {
    const result = await routeIntent('这个商机的健康度为什么一直在降')

    expect(result.intent).toBe('project_health')
    expect(result.confidence).toBe(0.85)
    expect(mockGenerateText).not.toHaveBeenCalled()
  })
})

describe('splitCompositeIntents', () => {
  it('returns empty for simple message', () => {
    const result = splitCompositeIntents('分析这个项目')
    expect(result.intents).toHaveLength(0)
    expect(result.needsAsync).toBe(false)
  })

  it('detects async need for long message', () => {
    const longMessage = 'A'.repeat(501)
    const result = splitCompositeIntents(longMessage)
    expect(result.needsAsync).toBe(true)
  })

  it('detects async need for many segments', () => {
    const message = '分析一下A项目;分析一下B项目;分析一下C项目;分析一下D项目;分析一下E项目'
    const result = splitCompositeIntents(message)
    expect(result.needsAsync).toBe(true)
  })
})
