import { describe, it, expect, vi, beforeEach } from 'vitest'
import { kbSearchSkill } from '../../../../../src/agents/skills/kb/kb-search.skill.js'

vi.mock('../../../../../src/infra/s3.js', () => ({
  downloadFile: vi.fn(),
}))

vi.mock('../../../../../src/knowledge-base/kb-parser.js', () => ({
  extractText: vi.fn(),
  truncateText: vi.fn().mockImplementation((text) => text),
}))

vi.mock('../../../../../src/knowledge-base/kb-analyzer.js', () => ({
  analyzeDocument: vi.fn(),
}))

vi.mock('../../../../../src/knowledge-base/kb-embedder.js', () => ({
  semanticSearch: vi.fn(),
}))

import { downloadFile } from '../../../../../src/infra/s3.js'
import { extractText, truncateText } from '../../../../../src/knowledge-base/kb-parser.js'
import { analyzeDocument } from '../../../../../src/knowledge-base/kb-analyzer.js'
import { semanticSearch } from '../../../../../src/knowledge-base/kb-embedder.js'

describe('kb-search.skill', () => {
  const mockPrisma = {
    kbDocument: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  }

  const ctx = {
    tenantId: 'tenant_1',
    userId: 'user_1',
    role: 'SALES',
    orgId: 'org_1',
    prisma: mockPrisma as never,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('searches documents by keyword and category', async () => {
    mockPrisma.kbDocument.findMany.mockResolvedValue([{ id: 'doc_1', fileName: 'test.pdf' }])
    const result = await kbSearchSkill.execute({
      params: { action: 'searchDocuments', keyword: 'test', category: 'case' },
      context: ctx,
    })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ action: 'searchDocuments', count: 1 })
    expect(mockPrisma.kbDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant_1', fileName: expect.any(Object), category: 'case' }),
      })
    )
  })

  it('performs semantic search', async () => {
    vi.mocked(semanticSearch).mockResolvedValue([
      { documentId: 'doc_1', content: 'content', similarity: 0.9, fileName: 'file.pdf' },
    ])
    const result = await kbSearchSkill.execute({
      params: { action: 'semanticSearch', query: 'query', topK: 3 },
      context: ctx,
    })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ action: 'semanticSearch', count: 1 })
    expect(semanticSearch).toHaveBeenCalledWith('tenant_1', 'query', 3)
  })

  it('analyzes document successfully', async () => {
    mockPrisma.kbDocument.findUnique.mockResolvedValue({
      id: 'doc_1',
      fileName: 'test.pdf',
      storageKey: 'key',
      fileType: 'pdf',
      status: 'embedded',
    })
    vi.mocked(downloadFile).mockResolvedValue(Buffer.from('pdf content'))
    vi.mocked(extractText).mockResolvedValue('extracted text')
    vi.mocked(analyzeDocument).mockResolvedValue({
      fileName: 'test.pdf',
      analysis: {
        summary: 'summary',
        entities: [{ name: 'ABC', type: 'COMPANY' }],
        enrollPreview: { accounts: [], leads: [], projects: [], contacts: [] },
      },
    })

    const result = await kbSearchSkill.execute({
      params: { action: 'analyzeDocument', documentId: 'doc_1' },
      context: ctx,
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ action: 'analyzeDocument', fileName: 'test.pdf' })
    expect(mockPrisma.kbDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'analyzed' } })
    )
  })

  it('returns error when document not found', async () => {
    mockPrisma.kbDocument.findUnique.mockResolvedValue(null)
    const result = await kbSearchSkill.execute({
      params: { action: 'analyzeDocument', documentId: 'doc_1' },
      context: ctx,
    })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('NOT_FOUND')
  })

  it('returns error when document text is empty', async () => {
    mockPrisma.kbDocument.findUnique.mockResolvedValue({
      id: 'doc_1',
      fileName: 'test.pdf',
      storageKey: 'key',
      fileType: 'pdf',
      status: 'embedded',
    })
    vi.mocked(downloadFile).mockResolvedValue(Buffer.from(''))
    vi.mocked(extractText).mockResolvedValue('')

    const result = await kbSearchSkill.execute({
      params: { action: 'analyzeDocument', documentId: 'doc_1' },
      context: ctx,
    })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('EMPTY_DOCUMENT')
  })
})
