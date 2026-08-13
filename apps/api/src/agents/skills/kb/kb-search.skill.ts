import { z } from 'zod'
import { downloadFile } from '../../../infra/s3.js'
import { extractText, truncateText } from '../../../knowledge-base/kb-parser.js'
import { analyzeDocument } from '../../../knowledge-base/kb-analyzer.js'
import { semanticSearch } from '../../../knowledge-base/kb-embedder.js'
import type { SkillDefinition } from '../skill-types.js'

const KbSearchInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('searchDocuments'),
    keyword: z.string().optional(),
    category: z.string().optional(),
  }),
  z.object({
    action: z.literal('semanticSearch'),
    query: z.string().min(1),
    topK: z.number().min(1).max(10).optional(),
  }),
  z.object({
    action: z.literal('analyzeDocument'),
    documentId: z.string().min(1),
  }),
])

const KbSearchOutputSchema = z.record(z.unknown())

export const kbSearchSkill: SkillDefinition<
  z.infer<typeof KbSearchInputSchema>,
  z.infer<typeof KbSearchOutputSchema>
> = {
  id: 'kb-search',
  name: '知识库搜索',
  description: '搜索、检索和分析当前租户知识库中的文档，获取历史案例、方法论、销售技巧等信息',
  category: 'search',
  readOnly: true,
  inputSchema: KbSearchInputSchema,
  outputSchema: KbSearchOutputSchema,
  execute: async ({ params, context }) => {
    const p = context.prisma
    const tenantId = context.tenantId

    if (params.action === 'searchDocuments') {
      const where: Record<string, unknown> = { tenantId }
      if (params.keyword) {
        where.fileName = { contains: params.keyword, mode: 'insensitive' }
      }
      if (params.category) {
        where.category = params.category
      }
      const docs = await p.kbDocument.findMany({
        where,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          category: true,
          status: true,
          createdAt: true,
        },
      })
      return { success: true, data: { action: 'searchDocuments', count: docs.length, documents: docs } }
    }

    if (params.action === 'semanticSearch') {
      const results = await semanticSearch(tenantId, params.query, params.topK || 5)
      return {
        success: true,
        data: {
          action: 'semanticSearch',
          count: results.length,
          results: results.map((r) => ({
            fileName: r.fileName,
            similarity: Number(r.similarity.toFixed(4)),
            content: r.content.length > 800 ? r.content.slice(0, 800) + '...' : r.content,
          })),
        },
      }
    }

    // analyzeDocument
    const doc = await p.kbDocument.findUnique({
      where: { id: params.documentId },
      select: { id: true, fileName: true, storageKey: true, fileType: true, status: true },
    })
    if (!doc) {
      return { success: false, error: { code: 'NOT_FOUND', message: '文档不存在' } }
    }

    const buffer = await downloadFile(doc.storageKey)
    const rawText = await extractText(buffer, doc.fileType)
    const text = truncateText(rawText, 15000)

    if (!text.trim()) {
      return { success: false, error: { code: 'EMPTY_DOCUMENT', message: '无法从文档中提取文本内容' } }
    }

    const result = await analyzeDocument(doc.fileName, text, context.userId)

    await p.kbDocument.update({
      where: { id: params.documentId },
      data: { status: 'analyzed' },
    })

    return {
      success: true,
      data: {
        action: 'analyzeDocument',
        fileName: result.fileName,
        summary: result.analysis.summary,
        entitiesFound: result.analysis.entities?.length || 0,
        entities: result.analysis.entities || [],
        enrollPreview: result.analysis.enrollPreview || {},
      },
    }
  },
}
