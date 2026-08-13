import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { uploadFile, downloadFile } from '../infra/s3.js'
import { extractText, truncateText } from './kb-parser.js'
import { analyzeDocument } from './kb-analyzer.js'
import { embedDocument, semanticSearch, invalidateEmbedding } from './kb-embedder.js'
import { validateUpload, KB_FILE_RULES } from './file-upload-guard.js'
import { scanFileContent } from './content-scanner.js'
import { AppError } from '../errors/app-error.js'
import { ErrorCode } from '../errors/error-codes.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

/**
 * 上传文件到知识库
 * multipart/form-data: files[] + scope (personal/tenant)
 */
export async function uploadFiles(req: FastifyRequest, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = req.user as { id: string; tenantId: string; orgId?: string } | undefined
  const tenantId = user?.tenantId || 'default'
  const userId = user?.id || 'anonymous'
  const orgId = user?.orgId

  const parts = req.parts()
  const uploaded: Array<{
    id: string
    fileName: string
    fileType: string
    fileSize: number
    status: string
    scope: string
    createdAt: Date
  }> = []

  for await (const part of parts) {
    if (part.type === 'file' && part.fieldname === 'files') {
      const buffer = await part.toBuffer()
      const contentType = part.mimetype || 'application/octet-stream'

      const validation = validateUpload(
        part.filename || 'unnamed',
        contentType,
        buffer.length,
        KB_FILE_RULES,
        tenantId,
      )

      // 内容安全扫描：拦截伪装的可执行文件/脚本，校验魔数一致
      scanFileContent(buffer, validation.ext)

      await uploadFile(validation.storageKey, buffer, contentType)

      const scope = ((req.body as Record<string, unknown>)?.scope as string) || 'PERSONAL'
      const doc = await prisma.kbDocument.create({
        data: {
          tenantId,
          fileName: validation.sanitizedName,
          storageKey: validation.storageKey,
          fileType: contentType,
          fileSize: buffer.length,
          uploadedBy: userId,
          orgId,
          status: 'active',
          scope,
        },
      })

      // 异步向量化（不阻塞上传响应）
      setImmediate(async () => {
        try {
          const rawText = await extractText(buffer, contentType)
          if (rawText.trim().length > 100) {
            await embedDocument(doc.id, rawText)
          }
        } catch {
          // 向量化失败不影响上传成功
        }
      })

      uploaded.push({
        id: doc.id,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        status: doc.status,
        scope: doc.scope,
        createdAt: doc.createdAt,
      })
    }
  }

  reply.send({ success: true, results: uploaded, total: uploaded.length })
}

/**
 * 获取知识库文件列表
 * query: ?scope=personal|tenant&page=1&pageSize=20
 */
export async function listFiles(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = req.user as { id: string; tenantId: string; orgId?: string } | undefined
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'
    const orgId = user?.orgId

    const query = req.query as { scope?: string; page?: string; pageSize?: string }
    const scope = query.scope || 'ALL'
    const page = Math.max(1, parseInt(query.page || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10)))

    // 三层权限过滤：PERSONAL / TEAM / TENANT
    const where: Record<string, unknown> = { tenantId }
    if (scope === 'PERSONAL') {
      where.uploadedBy = userId
    } else if (scope === 'TEAM') {
      where.OR = [
        { uploadedBy: userId },
        { scope: 'TENANT' },
        ...(orgId ? [{ scope: 'TEAM', orgId }] : []),
      ]
    } else if (scope === 'TENANT') {
      where.OR = [
        { uploadedBy: userId },
        { scope: 'TENANT' },
      ]
    } else {
      // ALL: 用户能看到所有有权限的文件
      where.OR = [
        { uploadedBy: userId },
        { scope: 'TENANT' },
        ...(orgId ? [{ scope: 'TEAM', orgId }] : []),
      ]
    }

    const [results, total] = await Promise.all([
      prisma.kbDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          category: true,
          scope: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.kbDocument.count({ where }),
    ])

    reply.send({ success: true, results, total, page, pageSize })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

/**
 * 手动触发文档向量化（或重新向量化）
 */
export async function embedFile(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const { id } = req.params

  const doc = await prisma.kbDocument.findUnique({
    where: { id },
    select: { id: true, fileName: true, storageKey: true, fileType: true, status: true },
  })
  if (!doc) {
    throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)
  }

  const buffer = await downloadFile(doc.storageKey)
  const rawText = await extractText(buffer, doc.fileType)
  const text = truncateText(rawText, 30000)

  if (!text.trim()) {
    throw new AppError(ErrorCode.BAD_REQUEST, '无法从文件中提取文本内容', 400)
  }

  const result = await embedDocument(doc.id, text)
  reply.send({ success: true, chunkCount: result.chunkCount })
}

/**
 * 语义搜索知识库
 */
export async function searchFiles(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as { id?: string; tenantId?: string; orgId?: string } | undefined
  const tenantId = user?.tenantId || 'default'
  const userId = user?.id
  const orgId = user?.orgId
  const query = (req.query as { q?: string }).q || ''
  const topK = Math.min(20, Math.max(1, parseInt((req.query as { topK?: string }).topK || '5', 10)))

  if (!query.trim()) {
    throw new AppError(ErrorCode.BAD_REQUEST, '缺少搜索关键词', 400)
  }

  const results = await semanticSearch(tenantId, query.trim(), topK, userId, orgId)
  reply.send({ success: true, results, total: results.length })
}

/**
 * AI 分析文件内容，提取结构化信息
 */
export async function analyzeFile(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const { id } = req.params

  const doc = await prisma.kbDocument.findUnique({
    where: { id },
    select: { id: true, fileName: true, storageKey: true, fileType: true, status: true },
  })
  if (!doc) {
    throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)
  }

  // 从 S3 下载文件
  const buffer = await downloadFile(doc.storageKey)

  // 解析文本
  const rawText = await extractText(buffer, doc.fileType)
  const text = truncateText(rawText, 15000)

  if (!text.trim()) {
    throw new AppError(ErrorCode.BAD_REQUEST, '无法从文件中提取文本内容', 400)
  }

  // AI 分析
  const userId = (req.user as { id?: string } | undefined)?.id || 'anonymous'
  const result = await analyzeDocument(doc.fileName, text, userId)

  // 更新文档状态为已分析；analyzed 状态的文档仍参与语义检索
  await prisma.kbDocument.update({
    where: { id },
    data: { status: 'analyzed' },
  })

  reply.send({ success: true, ...result })
}

/**
 * 删除知识库文件
 */
export async function removeFile(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const prisma = getPrisma(req)
  const user = req.user as { id?: string } | undefined
  const userId = user?.id || 'anonymous'
  const { id } = req.params

  const doc = await prisma.kbDocument.findUnique({ where: { id } })
  if (!doc) {
    throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)
  }

  // 只能删除自己上传的文件
  if (doc.uploadedBy !== userId) {
    throw new AppError(ErrorCode.AUTHORIZATION_ERROR, '无权删除此文件', 403)
  }

  // 显式清除 embedding chunks，再删除文档（Prisma 级联已配置，双重保险）
  await invalidateEmbedding(id)
  await prisma.kbDocument.delete({ where: { id } })
  reply.send({ success: true })
}
