/**
 * 批量导入销售背景资料到知识库
 * 用法: npx tsx scripts/import-sales-kb.ts
 */
import 'dotenv/config'
import { readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { prisma } from '../src/config/database.js'
import { uploadFile } from '../src/infra/s3.js'
import { embedDocument } from '../src/knowledge-base/kb-embedder.js'

const KB_DIR = '/Users/tanghaitao/Documents/Tom1.0/AI销售管理系统/销售背景资料'
const TENANT_ID = 'default'
const USER_ID = 'system'

async function main() {
  const files = readdirSync(KB_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(KB_DIR, f))

  console.log(`发现 ${files.length} 个 Markdown 文件，开始导入...`)

  for (const filePath of files) {
    const fileName = basename(filePath)
    const text = readFileSync(filePath, 'utf-8')
    const buffer = Buffer.from(text, 'utf-8')

    try {
      // 检查是否已存在同名文档
      const existing = await prisma.kbDocument.findFirst({
        where: { tenantId: TENANT_ID, fileName },
        select: { id: true, status: true },
      })

      if (existing) {
        if (existing.status === 'embedded') {
          console.log(`[跳过] ${fileName} 已导入且已向量化`)
          continue
        }
        // 已存在但未向量化，补做向量化
        if (text.trim().length > 100) {
          const result = await embedDocument(existing.id, text)
          console.log(`[补向量化] ${fileName} → ${result.chunkCount} chunks`)
        }
        continue
      }

      // 1. 上传文件到存储
      const ext = fileName.split('.').pop() || 'md'
      const storageKey = `${TENANT_ID}/sales-kb/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      await uploadFile(storageKey, buffer, 'text/markdown')
      console.log(`[上传] ${fileName} → ${storageKey}`)

      // 2. 创建 KbDocument 记录
      const doc = await prisma.kbDocument.create({
        data: {
          tenantId: TENANT_ID,
          fileName,
          storageKey,
          fileType: 'text/markdown',
          fileSize: buffer.length,
          uploadedBy: USER_ID,
          status: 'active',
          category: 'sales_methodology',
          title: fileName.replace(/\.md$/, ''),
          description: `销售背景资料：${fileName}`,
        },
      })
      console.log(`[创建] KbDocument id=${doc.id}`)

      // 3. 生成 Embedding
      if (text.trim().length > 100) {
        const result = await embedDocument(doc.id, text)
        console.log(`[向量化] ${fileName} → ${result.chunkCount} chunks`)
      } else {
        console.log(`[跳过] ${fileName} 内容太短`)
      }
    } catch (err) {
      console.error(`[失败] ${fileName}:`, (err as Error).message)
    }
  }

  console.log('导入完成')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('脚本执行失败:', err)
  process.exit(1)
})
