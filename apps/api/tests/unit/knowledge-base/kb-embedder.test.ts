import { describe, it, expect, vi } from 'vitest'
import { chunkText, invalidateEmbedding, embedDocument, semanticSearch } from '../../../src/knowledge-base/kb-embedder.js'
import { prisma } from '../../../src/config/database.js'

vi.mock('../../../src/config/database.js', () => ({
  prisma: {
    kbChunk: { deleteMany: vi.fn() },
    kbDocument: { update: vi.fn() },
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}))

vi.mock('../../../src/knowledge-base/embedding-provider.js', () => ({
  embedTexts: vi.fn(),
}))

import { embedTexts } from '../../../src/knowledge-base/embedding-provider.js'

describe('kb-embedder', () => {
  describe('chunkText', () => {
    it('returns single chunk for short text', () => {
      const text = '这是一个用于测试分块逻辑的文本，需要超过最小长度阈值。'.repeat(5)
      const chunks = chunkText(text)
      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toBe(text)
    })

    it('returns empty array for text below minimum length', () => {
      expect(chunkText('hi')).toEqual([])
    })

    it('splits by paragraphs first', () => {
      const p1 = '第一段内容。'.repeat(300)
      const p2 = '第二段内容。'.repeat(300)
      const chunks = chunkText(`${p1}\n\n${p2}`)
      expect(chunks.length).toBeGreaterThanOrEqual(2)
    })

    it('handles long paragraphs by sentence', () => {
      const longSentence = '句子内容。'.repeat(400)
      const chunks = chunkText(longSentence)
      expect(chunks.length).toBeGreaterThan(0)
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(1500)
      }
    })
  })

  describe('invalidateEmbedding', () => {
    it('deletes chunks and resets document status', async () => {
      await invalidateEmbedding('doc-123')

      expect(prisma.kbChunk.deleteMany).toHaveBeenCalledWith({ where: { documentId: 'doc-123' } })
      expect(prisma.kbDocument.update).toHaveBeenCalledWith({
        where: { id: 'doc-123' },
        data: { status: 'active' },
      })
    })
  })

  describe('embedDocument', () => {
    it('returns zero chunks for empty text', async () => {
      const result = await embedDocument('doc-123', 'hi')
      expect(result.chunkCount).toBe(0)
      expect(prisma.kbChunk.deleteMany).toHaveBeenCalled()
    })

    it('creates chunks and updates status', async () => {
      const text = 'a'.repeat(500)
      vi.mocked(embedTexts).mockResolvedValue([{ embedding: [0.1, 0.2] }] as never)
      const result = await embedDocument('doc-123', text)
      expect(result.chunkCount).toBeGreaterThan(0)
      expect(prisma.$executeRawUnsafe).toHaveBeenCalled()
      expect(prisma.kbDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'embedded' } })
      )
    })

    it('invalidates on embedding error', async () => {
      const text = 'a'.repeat(500)
      vi.mocked(embedTexts).mockRejectedValue(new Error('embedding failed'))
      await expect(embedDocument('doc-123', text)).rejects.toThrow('embedding failed')
      expect(prisma.kbChunk.deleteMany).toHaveBeenCalled()
    })
  })

  describe('semanticSearch', () => {
    it('returns empty when no embedding', async () => {
      vi.mocked(embedTexts).mockResolvedValue([{}] as never)
      const result = await semanticSearch('tenant-1', 'query')
      expect(result).toEqual([])
    })

    it('returns mapped results', async () => {
      vi.mocked(embedTexts).mockResolvedValue([{ embedding: [0.1, 0.2] }] as never)
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        { documentId: 'doc-1', content: 'content', similarity: 0.9, fileName: 'file.pdf' },
      ] as never)
      const result = await semanticSearch('tenant-1', 'query', 5, 'user-1', 'org-1')
      expect(result).toHaveLength(1)
      expect(result[0].similarity).toBe(0.9)
    })
  })
})
