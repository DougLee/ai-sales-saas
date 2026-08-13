import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMammothExtract = vi.fn()

vi.mock('mammoth', () => ({
  default: {
    extractRawText: (...args: unknown[]) => mockMammothExtract(...args),
  },
}))

vi.mock('pdf-parse/lib/pdf-parse.js', () => ({
  default: vi.fn((buffer: Buffer) => Promise.resolve({ text: `PDF text: ${buffer.toString()}` })),
}))

import { extractText, truncateText } from '../../../src/knowledge-base/kb-parser.js'

describe('kb-parser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts text from plain text', async () => {
    const result = await extractText(Buffer.from('hello world'), 'text/plain')
    expect(result).toBe('hello world')
  })

  it('extracts text from markdown', async () => {
    const result = await extractText(Buffer.from('# 标题\n正文'), 'text/markdown')
    expect(result).toBe('# 标题\n正文')
  })

  it('extracts text from csv', async () => {
    const result = await extractText(Buffer.from('a,b,c'), 'text/csv')
    expect(result).toBe('a,b,c')
  })

  it('extracts text from pdf', async () => {
    const result = await extractText(Buffer.from('pdf-buffer'), 'application/pdf')
    expect(result).toBe('PDF text: pdf-buffer')
  })

  it('extracts text from docx', async () => {
    mockMammothExtract.mockResolvedValue({ value: 'word content' })
    const result = await extractText(
      Buffer.from('word-buffer'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(result).toBe('word content')
  })

  it('returns empty string when docx extraction yields no value', async () => {
    mockMammothExtract.mockResolvedValue({ value: '' })
    const result = await extractText(Buffer.from('word-buffer'), 'application/msword')
    expect(result).toBe('')
  })

  it('falls back to utf-8 for unknown mime type', async () => {
    const result = await extractText(Buffer.from('unknown'), 'application/unknown')
    expect(result).toBe('unknown')
  })

  describe('truncateText', () => {
    it('returns original text when within limit', () => {
      expect(truncateText('short', 100)).toBe('short')
    })

    it('truncates long text and appends ellipsis', () => {
      const long = 'a'.repeat(12000)
      const result = truncateText(long, 100)
      expect(result).toBe('a'.repeat(100) + '\n...（内容已截断）')
    })

    it('uses default maxChars when not specified', () => {
      const text = 'a'.repeat(12001)
      const result = truncateText(text)
      expect(result).toBe('a'.repeat(12000) + '\n...（内容已截断）')
      expect(result.endsWith('\n...（内容已截断）')).toBe(true)
    })
  })
})
