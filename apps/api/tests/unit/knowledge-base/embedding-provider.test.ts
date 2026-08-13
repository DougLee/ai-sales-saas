import { describe, it, expect, vi, beforeEach } from 'vitest'
import { embedTexts, testEmbeddingConnection } from '../../../src/knowledge-base/embedding-provider.js'

vi.mock('../../../src/config/ai-config.js', () => ({
  getAIConfig: vi.fn().mockReturnValue({
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiApiKey: 'key',
    embeddingModelName: 'text-embedding-3-small',
    embeddingDimension: 1536,
    embeddingUseSameCredentials: true,
  }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('embedding-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty for empty inputs', async () => {
    const result = await embedTexts([])
    expect(result).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls embedding API and returns sorted results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { embedding: [0.1, 0.2], index: 1 },
          { embedding: [0.3, 0.4], index: 0 },
        ],
      }),
    } as never)

    const result = await embedTexts(['hello', 'world'])
    expect(result).toHaveLength(2)
    expect(result[0].index).toBe(0)
    expect(result[1].index).toBe(1)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer key' }),
      })
    )
  })

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'server error',
    } as never)
    await expect(embedTexts(['hello'])).rejects.toThrow('Embedding API error')
  })

  it('throws on API error in response body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { message: 'bad request' } }),
    } as never)
    await expect(embedTexts(['hello'])).rejects.toThrow('bad request')
  })

  it('throws on empty data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as never)
    await expect(embedTexts(['hello'])).rejects.toThrow('empty data')
  })

  it('tests connection successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }] }),
    } as never)
    const result = await testEmbeddingConnection()
    expect(result.success).toBe(true)
    expect(result.dimension).toBe(3)
  })

  it('tests connection failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    } as never)
    const result = await testEmbeddingConnection()
    expect(result.success).toBe(false)
  })
})
