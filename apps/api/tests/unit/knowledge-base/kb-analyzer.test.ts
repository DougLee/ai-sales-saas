import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeDocument } from '../../../src/knowledge-base/kb-analyzer.js'

vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

vi.mock('../../../src/config/model-provider.js', () => ({
  createModel: vi.fn().mockReturnValue('mock-model'),
}))

vi.mock('../../../src/infra/concurrency-limiter.js', () => ({
  llmConcurrencyLimiter: {
    run: vi.fn().mockImplementation((_userId, fn) => fn()),
  },
}))

import { generateText } from 'ai'

describe('kb-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed JSON analysis', async () => {
    const analysis = {
      summary: 'summary',
      entities: [{ name: 'ABC', type: 'COMPANY' }],
      enrollPreview: {
        accounts: [{ name: 'ABC' }],
        leads: [],
        projects: [],
        contacts: [],
      },
    }
    vi.mocked(generateText).mockResolvedValue({ text: JSON.stringify(analysis) } as never)

    const result = await analyzeDocument('doc.pdf', 'content')

    expect(result.fileName).toBe('doc.pdf')
    expect(result.analysis.summary).toBe('summary')
    expect(result.analysis.entities).toHaveLength(1)
  })

  it('returns empty defaults when LLM returns invalid JSON', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: 'not json' } as never)

    const result = await analyzeDocument('doc.pdf', 'content')

    expect(result.fileName).toBe('doc.pdf')
    expect(result.analysis.summary).toBe('not json')
    expect(result.analysis.entities).toEqual([])
  })

  it('uses anonymous user when userId not provided', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '{}' } as never)
    const { llmConcurrencyLimiter } = await import('../../../src/infra/concurrency-limiter.js')

    await analyzeDocument('doc.pdf', 'content')

    expect(llmConcurrencyLimiter.run).toHaveBeenCalledWith('anonymous', expect.any(Function))
  })
})
