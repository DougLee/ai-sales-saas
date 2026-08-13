import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { embedDocument } from '../knowledge-base/kb-embedder.js'

const prisma = new PrismaClient()
const KB_DIR = '/Users/tanghaitao/Documents/Tom1.0/AI销售管理系统/销售背景资料'
const TENANT_ID = 'default'
const UPLOADED_BY = 'system'

async function main() {
  const files = fs.readdirSync(KB_DIR).filter(f => f.endsWith('.md'))
  console.log(`Found ${files.length} markdown files`)

  for (const file of files) {
    const filePath = path.join(KB_DIR, file)
    const content = fs.readFileSync(filePath, 'utf-8')
    const stat = fs.statSync(filePath)

    const existing = await prisma.kbDocument.findFirst({
      where: { tenantId: TENANT_ID, fileName: file },
    })
    if (existing) {
      console.log(`Skip existing: ${file}`)
      continue
    }

    const doc = await prisma.kbDocument.create({
      data: {
        tenantId: TENANT_ID,
        fileName: file,
        storageKey: filePath,
        fileType: 'text/markdown',
        fileSize: stat.size,
        title: file.replace(/\.md$/, ''),
        category: 'sales_methodology',
        status: 'active',
        uploadedBy: UPLOADED_BY,
      },
    })
    console.log(`Created doc: ${file} (${doc.id})`)

    try {
      const result = await embedDocument(doc.id, content)
      console.log(`  Embedded: ${result.chunkCount} chunks`)
    } catch (e) {
      console.error(`  Embed failed for ${file}:`, (e as Error).message)
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect())
