import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { customerCompanion } from '@/agents/workflows/customer-companion'
import { createProject, createTenant, cleanupTestData } from '../../../factories'

const prisma = new PrismaClient()
const TEST_TENANT = 'companion-test-tenant'

let dbAvailable = false
try {
  await prisma.$queryRaw`SELECT 1`
  dbAvailable = true
} catch {
  console.warn('[companion integration] Database unavailable, skipping')
}

describe('customerCompanion integration', () => {
  beforeEach(async () => {
    if (!dbAvailable) return
    await cleanupTestData(TEST_TENANT)
    await createTenant({ id: TEST_TENANT, slug: TEST_TENANT })
  })

  afterAll(async () => {
    if (dbAvailable) await cleanupTestData(TEST_TENANT)
    await prisma.$disconnect()
  })

  // ===== alert mode =====

  it.skipIf(!dbAvailable)('alert mode: waiting 项目跳过检测', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Waiting Companion Project',
      waitingStatus: 'awaiting_tender',
      waitingSince: new Date(),
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    })

    const result = await customerCompanion(prisma, {
      mode: 'alert',
      tenantId: TEST_TENANT,
      projectId: project.id,
    })
    expect(result.success).toBe(true)
    expect((result as { alerts: unknown[] }).alerts).toEqual([])
    expect((result as { skipped: string }).skipped).toContain('awaiting_tender')
  })

  it.skipIf(!dbAvailable)('alert mode: 无有效跟进超过档位 staleDays 触发高风险预警', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Stale Companion Project',
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      milestone: 3,
    })

    const result = await customerCompanion(prisma, {
      mode: 'alert',
      tenantId: TEST_TENANT,
      projectId: project.id,
    })
    expect(result.success).toBe(true)
    const alerts = (result as { alerts: Array<{ type: string; severity: string }> }).alerts
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(alerts.some((a) => a.type === 'stale_project')).toBe(true)
  })

  it.skipIf(!dbAvailable)('alert mode: 闭环且达档位 minScore 的最近拜访不算停滞', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Recovered Project',
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      milestone: 3,
    })

    const visit = await prisma.visit.create({
      data: {
        tenantId: TEST_TENANT,
        ownerId: project.ownerId,
        projectId: project.id,
        visitTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        visitType: 'offline',
      },
    })
    await prisma.visitClosure.create({
      data: {
        visitId: visit.id,
        projectId: project.id,
        ownerId: project.ownerId,
        closedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        qualityScore: 50,
      },
    })

    const result = await customerCompanion(prisma, {
      mode: 'alert',
      tenantId: TEST_TENANT,
      projectId: project.id,
    })
    const alerts = (result as { alerts: Array<{ type: string }> }).alerts
    expect(alerts.some((a) => a.type === 'stale_project')).toBe(false)
  })

  it.skipIf(!dbAvailable)('alert mode: 闭环但质量分 < minScore 不算有效跟进', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Low Quality Closure',
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      milestone: 3,
    })

    const visit = await prisma.visit.create({
      data: {
        tenantId: TEST_TENANT,
        ownerId: project.ownerId,
        projectId: project.id,
        visitTime: new Date(),
        visitType: 'offline',
      },
    })
    await prisma.visitClosure.create({
      data: {
        visitId: visit.id,
        projectId: project.id,
        ownerId: project.ownerId,
        closedAt: new Date(),
        qualityScore: 25,
      },
    })

    const result = await customerCompanion(prisma, {
      mode: 'alert',
      tenantId: TEST_TENANT,
      projectId: project.id,
    })
    const alerts = (result as { alerts: Array<{ type: string }> }).alerts
    expect(alerts.some((a) => a.type === 'stale_project')).toBe(true)
  })

  // ===== briefing mode =====

  it.skipIf(!dbAvailable)('briefing mode: 返回 top5 排序结果', async () => {
    const owner = await prisma.user.create({
      data: {
        tenantId: TEST_TENANT,
        email: `briefing-${Date.now()}@test.com`,
        name: 'Briefing Owner',
        role: 'SALES',
        orgId: (await prisma.org.create({ data: { tenantId: TEST_TENANT, name: 'O' } })).id,
        passwordHash: 'h',
      },
    })

    // 建 6 个项目：1 个高逾期、5 个普通
    await createProject({
      tenantId: TEST_TENANT,
      ownerId: owner.id,
      name: 'Urgent Project',
      milestone: 2,
    })
    for (let i = 0; i < 5; i++) {
      await createProject({
        tenantId: TEST_TENANT,
        ownerId: owner.id,
        name: `Normal ${i}`,
        milestone: 2,
      })
    }
    // 给 urgent 一个逾期 task
    const urgent = await prisma.project.findFirst({ where: { name: 'Urgent Project', tenantId: TEST_TENANT } })
    if (urgent) {
      await prisma.task.create({
        data: {
          tenantId: TEST_TENANT,
          ownerId: owner.id,
          projectId: urgent.id,
          title: '逾期任务',
          status: 'PENDING',
          priority: 'HIGH',
          deadline: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        },
      })
    }

    const result = await customerCompanion(prisma, {
      mode: 'briefing',
      tenantId: TEST_TENANT,
      userId: owner.id,
    })
    expect(result.success).toBe(true)
    const briefing = (result as { briefing: { top5: Array<{ projectName: string }>; projectCount: number; urgentCount: number } }).briefing
    expect(briefing.projectCount).toBe(6)
    expect(briefing.urgentCount).toBe(1)
    expect(briefing.top5.length).toBeLessThanOrEqual(5)
    expect(briefing.top5[0].projectName).toBe('Urgent Project') // 逾期排在最前
  })

  // ===== handover mode =====

  it.skipIf(!dbAvailable)('handover mode: 项目不存在抛错', async () => {
    await expect(
      customerCompanion(prisma, {
        mode: 'handover',
        tenantId: TEST_TENANT,
        projectId: 'non-existent',
      }),
    ).rejects.toThrow()
  })

  it.skipIf(!dbAvailable)('handover mode: 有效项目返回结构化简报（预创建快照避免依赖 LLM）', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Handover Project',
      milestone: 4,
      healthScore: 65,
    })

    // 预创建一张有效快照，避免 handover 触发 runSnapshotMode（依赖 LLM）
    await prisma.customerSnapshot.create({
      data: {
        tenantId: TEST_TENANT,
        customerId: project.companyId || '',
        projectId: project.id,
        weeklySummary: '本周关键：客户态度积极',
        monthlySummary: '本月关系稳',
        quarterlyView: '季度关注预算',
        currentStage: '4',
        healthScore: 70,
        riskFlags: [],
        nextActions: [],
        generatedBy: 'test-fixture',
        expiresAt: new Date(Date.now() + 24 * 3600000),
        coversUntil: new Date(),
      },
    })

    const result = await customerCompanion(prisma, {
      mode: 'handover',
      tenantId: TEST_TENANT,
      projectId: project.id,
    })
    expect(result.success).toBe(true)
    const handover = (result as { handover: { project: { name: string }; snapshot: { weeklySummary: string } | null; openCounts: unknown } }).handover
    expect(handover.project.name).toBe('Handover Project')
    expect(handover.snapshot?.weeklySummary).toBe('本周关键：客户态度积极')
    expect(handover.openCounts).toBeDefined()
  })
})