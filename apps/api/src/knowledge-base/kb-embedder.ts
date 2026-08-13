import { prisma } from '../config/database.js'
import { embedTexts } from './embedding-provider.js'

const MAX_CHUNK_LENGTH = 1500
const MIN_CHUNK_LENGTH = 100
const OVERLAP_LENGTH = 100

/**
 * 将长文本切分为适合 Embedding 的 chunks
 * 策略：优先按段落切分，长段落再按句子/固定长度切分
 */
export function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_LENGTH) {
    return text.trim().length >= MIN_CHUNK_LENGTH ? [text.trim()] : []
  }

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []

  for (const para of paragraphs) {
    if (para.length <= MAX_CHUNK_LENGTH) {
      if (para.length >= MIN_CHUNK_LENGTH) chunks.push(para)
      continue
    }

    // 长段落按句子切分
    const sentences = para.split(/(?<=[。！？.!?])\s*/)
    let current = ''
    for (const sentence of sentences) {
      if (current.length + sentence.length > MAX_CHUNK_LENGTH) {
        if (current.length >= MIN_CHUNK_LENGTH) chunks.push(current.trim())
        current = sentence
      } else {
        current += sentence
      }
    }
    if (current.length >= MIN_CHUNK_LENGTH) chunks.push(current.trim())
  }

  // 如果还有超长块，按固定长度+重叠兜底
  const result: string[] = []
  for (const chunk of chunks) {
    if (chunk.length <= MAX_CHUNK_LENGTH) {
      result.push(chunk)
      continue
    }
    for (let i = 0; i < chunk.length; i += MAX_CHUNK_LENGTH - OVERLAP_LENGTH) {
      const piece = chunk.slice(i, i + MAX_CHUNK_LENGTH)
      if (piece.length >= MIN_CHUNK_LENGTH) result.push(piece.trim())
    }
  }

  return result
}

/**
 * 标记文档 embedding 失效并清除 chunks
 */
export async function invalidateEmbedding(documentId: string) {
  await prisma.kbChunk.deleteMany({ where: { documentId } })
  await prisma.kbDocument.update({
    where: { id: documentId },
    data: { status: 'active' },
  })
}

/**
 * 为知识库文档生成 Embedding 并存储
 */
export async function embedDocument(documentId: string, text: string) {
  const chunks = chunkText(text)
  if (chunks.length === 0) {
    await invalidateEmbedding(documentId)
    return { chunkCount: 0 }
  }

  try {
    const embeddings = await embedTexts(chunks)

    // embedding 列由 raw SQL 管理（不在 Prisma schema 中声明），确保列存在
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'KbChunk' AND column_name = 'embedding'
        ) THEN
          ALTER TABLE "KbChunk" ADD COLUMN embedding vector(1536);
        END IF;
      END $$;
    `)

    // 先清除旧 chunks
    await prisma.kbChunk.deleteMany({ where: { documentId } })

    // 写入新 chunks（使用 raw query 插入 vector）
    for (let i = 0; i < chunks.length; i++) {
      const emb = embeddings[i]?.embedding
      if (!emb) continue
      const vectorStr = `[${emb.join(',')}]`
      await prisma.$executeRawUnsafe(
        `INSERT INTO "KbChunk" (id, "documentId", "chunkIndex", content, embedding, metadata) VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb)`,
        crypto.randomUUID(),
        documentId,
        i,
        chunks[i],
        vectorStr,
        JSON.stringify({ source: 'auto' }),
      )
    }

    // 更新文档状态为已向量化
    await prisma.kbDocument.update({
      where: { id: documentId },
      data: { status: 'embedded' },
    })

    return { chunkCount: chunks.length }
  } catch (err) {
    // 向量化失败时清理残留 chunks，避免过期向量参与检索
    await invalidateEmbedding(documentId)
    throw err
  }
}

/**
 * 语义检索：根据查询文本返回最相关的文档片段
 */
export async function semanticSearch(
  tenantId: string,
  query: string,
  topK = 5,
  userId?: string,
  orgId?: string,
): Promise<Array<{ documentId: string; content: string; similarity: number; fileName: string }>> {
  const embeddings = await embedTexts([query])
  const queryVector = embeddings[0]?.embedding
  if (!queryVector) return []

  const vectorStr = `[${queryVector.join(',')}]`

  // 三层权限过滤：PERSONAL（仅自己）/ TEAM（同部门）/ TENANT（全租户）
  const scopeFilter = userId
    ? `AND (
      d."uploadedBy" = '${userId}'
      OR d.scope = 'TENANT'
      ${orgId ? `OR (d.scope = 'TEAM' AND d."orgId" = '${orgId}')` : ''}
    )`
    : ''

  // pgvector 余弦距离查询：只检索已完成向量化或分析的文档
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      documentId: string
      content: string
      similarity: number
      fileName: string
    }>
  >(
    `
    SELECT
      c."documentId" as "documentId",
      c.content as content,
      1 - (c.embedding <=> $1::vector) as similarity,
      d."fileName" as "fileName"
    FROM "KbChunk" c
    JOIN "KbDocument" d ON c."documentId" = d.id
    WHERE d."tenantId" = $2 AND d.status IN ('embedded', 'analyzed')
    ${scopeFilter}
    ORDER BY c.embedding <=> $1::vector
    LIMIT $3
    `,
    vectorStr,
    tenantId,
    topK,
  )

  return rows.map((r) => ({
    documentId: r.documentId,
    content: r.content,
    similarity: Number(r.similarity),
    fileName: r.fileName,
  }))
}
