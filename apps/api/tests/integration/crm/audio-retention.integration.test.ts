import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanupAudioRetention } from '@/crm/visits/audio-retention.service'
import { createProject, createUser, createTenant, cleanupTestData } from '../../factories'

const prisma = new PrismaClient()
const TEST_TENANT = 'integration-test-tenant'
const TMP_DIR = join(process.cwd(), 'tests', '.tmp-audio')

let dbAvailable = false
try {
  await prisma.$queryRaw`SELECT 1`
  dbAvailable = true
} catch {
  console.warn('[audio-retention integration] Database unavailable, skipping')
}

function makeLocalAudio(name: string): string {
  mkdirSync(TMP_DIR, { recursive: true })
  const p = join(TMP_DIR, name)
  writeFileSync(p, Buffer.from('fake-audio'))
  return `file://${p}`
}

async function seedVisit(audioUrl: string | null, createdAt: Date, projectClosedAt?: Date) {
  const user = await createUser({ tenantId: TEST_TENANT })
  const company = await prisma.company.create({
    data: { tenantId: TEST_TENANT, name: `Audio Co ${Date.now()} ${Math.random()}` },
  })
  const project = await createProject({
    tenantId: TEST_TENANT,
    ownerId: user.id,
    orgId: user.orgId,
    companyId: company.id,
    ...(projectClosedAt ? { closedAt: projectClosedAt } : {}),
  })
  const visit = await prisma.visit.create({
    data: {
      tenantId: TEST_TENANT,
      ownerId: user.id,
      companyId: company.id,
      projectId: project.id,
      visitTime: createdAt,
      visitType: 'offline',
      audioUrl,
      createdAt,
    },
  })
  return { user, company, project, visit }
}

describe('audio-retention integration (V6.1 录音合规)', () => {
  beforeEach(async () => {
    if (!dbAvailable) return
    await cleanupTestData(TEST_TENANT)
    await createTenant({ id: TEST_TENANT, slug: TEST_TENANT })
  })

  afterAll(async () => {
    if (dbAvailable) await cleanupTestData(TEST_TENANT)
    await prisma.$disconnect()
  })

  it.skipIf(!dbAvailable)('超过 90 天的音频被清除，audioUrl 置空，转写文本保留', async () => {
    const old = new Date(Date.now() - 100 * 86400000)
    const url = makeLocalAudio('old.mp3')
    const { visit } = await seedVisit(url, old)
    await prisma.visit.update({ where: { id: visit.id }, data: { audioTranscript: '转写文本保留' } })

    const result = await cleanupAudioRetention(prisma, TEST_TENANT)

    expect(result.purged).toBe(1)
    const updated = await prisma.visit.findUnique({ where: { id: visit.id } })
    expect(updated!.audioUrl).toBeNull()
    expect(updated!.audioTranscript).toBe('转写文本保留')
    expect(existsSync(url.slice('file://'.length))).toBe(false)
  })

  it.skipIf(!dbAvailable)('90 天内的音频不清理', async () => {
    const recent = new Date(Date.now() - 10 * 86400000)
    const url = makeLocalAudio('recent.mp3')
    const { visit } = await seedVisit(url, recent)

    const result = await cleanupAudioRetention(prisma, TEST_TENANT)

    expect(result.purged).toBe(0)
    const updated = await prisma.visit.findUnique({ where: { id: visit.id } })
    expect(updated!.audioUrl).toBe(url)
  })

  it.skipIf(!dbAvailable)('项目关闭 30 天后音频清除（即使拜访未超 90 天）', async () => {
    const recent = new Date(Date.now() - 10 * 86400000)
    const closedLongAgo = new Date(Date.now() - 40 * 86400000)
    const url = makeLocalAudio('closed.mp3')
    const { visit } = await seedVisit(url, recent, closedLongAgo)

    const result = await cleanupAudioRetention(prisma, TEST_TENANT)

    expect(result.purged).toBe(1)
    const updated = await prisma.visit.findUnique({ where: { id: visit.id } })
    expect(updated!.audioUrl).toBeNull()
  })

  it.skipIf(!dbAvailable)('删除失败不计入 purged，留待下轮重试', async () => {
    const old = new Date(Date.now() - 100 * 86400000)
    // 未知存储形态（非 file:// 非本集群 MinIO 前缀）→ deleteFileByUrl 返回 false
    const { visit } = await seedVisit('http://other-host/bucket/x.mp3', old)

    const result = await cleanupAudioRetention(prisma, TEST_TENANT)

    expect(result.failed).toBe(1)
    expect(result.purged).toBe(0)
    const updated = await prisma.visit.findUnique({ where: { id: visit.id } })
    expect(updated!.audioUrl).toBe('http://other-host/bucket/x.mp3')
  })
})
