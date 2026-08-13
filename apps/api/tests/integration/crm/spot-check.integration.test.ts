import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import {
  sampleWeeklySpotCheck,
  recordSpotCheck,
  getDeviationReport,
  getWeekStart,
  SPOT_CHECK_TOLERANCE,
} from '@/crm/spotcheck/spot-check.service'
import { createProject, createUser, createTenant, cleanupTestData } from '../../factories'

const prisma = new PrismaClient()
const TEST_TENANT = 'integration-test-tenant'

let dbAvailable = false
try {
  await prisma.$queryRaw`SELECT 1`
  dbAvailable = true
} catch {
  console.warn('[spot-check integration] Database unavailable, skipping')
}

/** 造一条已闭环的 visitClosure */
async function seedClosure(ownerId: string, qualityScore: number, closedAt: Date, rubricScore?: number) {
  const project = await createProject({ tenantId: TEST_TENANT, ownerId })
  const company = await prisma.company.create({
    data: { tenantId: TEST_TENANT, name: `SC Co ${Date.now()} ${Math.random()}` },
  })
  const visit = await prisma.visit.create({
    data: {
      tenantId: TEST_TENANT,
      ownerId,
      companyId: company.id,
      projectId: project.id,
      visitTime: closedAt,
      visitType: 'offline',
      rawInput: '速记',
      createdAt: closedAt,
    },
  })
  return prisma.visitClosure.create({
    data: {
      visitId: visit.id,
      projectId: project.id,
      ownerId,
      hasPreparation: true,
      hasRecording: true,
      hasSummary: true,
      hasAiAnalysis: true,
      hasFollowUp: true,
      hasConfirmation: true,
      qualityScore,
      rubricScore,
      closedAt,
      createdAt: closedAt,
    },
  })
}

describe('spot-check integration (V6.1 §6.1.5)', () => {
  beforeEach(async () => {
    if (!dbAvailable) return
    await cleanupTestData(TEST_TENANT)
    await createTenant({ id: TEST_TENANT, slug: TEST_TENANT })
  })

  afterAll(async () => {
    if (dbAvailable) await cleanupTestData(TEST_TENANT)
    await prisma.$disconnect()
  })

  it.skipIf(!dbAvailable)('抽样 10%（至少 1 条），只抽已闭环且未抽检的', async () => {
    const user = await createUser({ tenantId: TEST_TENANT })
    const lastWeek = new Date(getWeekStart().getTime() - 3 * 86400000) // 上周中

    // 20 条已闭环 → 抽 2 条
    for (let i = 0; i < 20; i++) {
      await seedClosure(user.id, 30 + i * 3, lastWeek)
    }
    // 1 条未闭环（closedAt=null）不应被抽：直接造 closedAt 在本周的也不应被抽
    await seedClosure(user.id, 90, new Date()) // 本周闭环，不在上周窗口

    const sample = await sampleWeeklySpotCheck(prisma, TEST_TENANT)
    expect(sample.length).toBe(2)
    // 分层：高低分各一
    const scores = sample.map((s) => s.qualityScore || 0)
    expect(Math.max(...scores)).toBeGreaterThan(80)
    expect(Math.min(...scores)).toBeLessThan(40)
  })

  it.skipIf(!dbAvailable)('少量样本至少抽 1 条', async () => {
    const user = await createUser({ tenantId: TEST_TENANT })
    const lastWeek = new Date(getWeekStart().getTime() - 3 * 86400000)
    await seedClosure(user.id, 55, lastWeek)
    await seedClosure(user.id, 65, lastWeek)

    const sample = await sampleWeeklySpotCheck(prisma, TEST_TENANT)
    expect(sample.length).toBe(1)
  })

  it.skipIf(!dbAvailable)('提交抽检评分 → spotChecked 落库；重复提交 409 语义（抛错）', async () => {
    const user = await createUser({ tenantId: TEST_TENANT })
    const manager = await createUser({ tenantId: TEST_TENANT })
    const lastWeek = new Date(getWeekStart().getTime() - 3 * 86400000)
    const closure = await seedClosure(user.id, 60, lastWeek, 70)

    await recordSpotCheck(prisma, { closureId: closure.id, managerId: manager.id, managerScore: 75, comment: '记录属实' })

    const updated = await prisma.visitClosure.findUnique({ where: { id: closure.id } })
    expect(updated!.spotChecked).toBe(true)
    expect(updated!.spotCheckScore).toBe(75)
    expect(updated!.spotCheckBy).toBe(manager.id)

    await expect(
      recordSpotCheck(prisma, { closureId: closure.id, managerId: manager.id, managerScore: 80 }),
    ).rejects.toThrow('已抽检')
  })

  it.skipIf(!dbAvailable)('偏差报告：>15 分进校准清单，一致率计算正确', async () => {
    const user = await createUser({ tenantId: TEST_TENANT })
    const manager = await createUser({ tenantId: TEST_TENANT })
    const lastWeek = new Date(getWeekStart().getTime() - 3 * 86400000)

    // 3 条一致（偏差≤15）+ 1 条偏离（偏差 30）
    const cases = [
      { rubric: 70, manager: 75 },
      { rubric: 60, manager: 50 },
      { rubric: 80, manager: 80 },
      { rubric: 40, manager: 70 }, // 偏差 30 → outlier
    ]
    for (const c of cases) {
      const closure = await seedClosure(user.id, 60, lastWeek, c.rubric)
      await recordSpotCheck(prisma, { closureId: closure.id, managerId: manager.id, managerScore: c.manager })
    }

    const report = await getDeviationReport(prisma, TEST_TENANT)
    expect(report.totalChecked).toBe(4)
    expect(report.withinTolerance).toBe(3)
    expect(report.consistencyRate).toBe(75)
    expect(report.outliers).toHaveLength(1)
    expect(report.outliers[0].deviation).toBe(30)
    expect(SPOT_CHECK_TOLERANCE).toBe(15)
  })
})
