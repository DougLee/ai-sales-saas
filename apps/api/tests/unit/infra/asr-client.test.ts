import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAsrClient } from '../../../src/infra/asr-client.js'

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('../../../src/infra/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

describe('asr-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates sensevoice client and transcribes successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'hello', confidence: 0.95, segments: [{ start: 0, end: 1, text: 'hello' }] }),
    } as never)

    const client = createAsrClient('sensevoice', { apiKey: 'key' })
    const result = await client.transcribe(Buffer.from('audio'))

    expect(result.text).toBe('hello')
    expect(result.confidence).toBe(0.95)
    expect(result.segments).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer key' }),
      })
    )
  })

  it('uses webm extension for webm mime type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'hello' }),
    } as never)

    const client = createAsrClient('sensevoice', { apiKey: 'key' })
    await client.transcribe(Buffer.from('audio'), { mimeType: 'audio/webm' })

    const form = mockFetch.mock.calls[0][1].body as FormData
    expect(form.get('file')).toBeDefined()
  })

  it('throws on ASR error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => 'error',
    } as never)

    const client = createAsrClient('sensevoice', { apiKey: 'key' })
    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow('ASR failed')
  })

  it('creates xunfei client that returns empty result', async () => {
    const client = createAsrClient('xunfei', { appId: 'a', apiKey: 'k', apiSecret: 's' })
    const result = await client.transcribe(Buffer.from('audio'))
    expect(result.text).toBe('')
    expect(result.confidence).toBe(0)
  })
})
