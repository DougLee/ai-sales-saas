import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { runDailyScan } from '@/agents/workflows/daily-scan'
import { seedDefaultTypeConfigs } from '@/agents/workflows/project-type-config'
import { createProject, createLead, createTask, createTenant, cleanupTestData } from '../../../factories'

const prisma = new PrismaClient()
const TEST_TENANT = 'integration-test-tenant'

let dbAvailable = false
try {
  await prisma.$queryRaw`SELECT 1`
  dbAvailable = true
} catch {
  console.warn('[daily-scan integration] Database unavailable, skipping')
}

describe('runDailyScan integration', () => {
  beforeEach(async () => {
    if (!dbAvailable) return
    await cleanupTestData(TEST_TENANT)
    await createTenant({ id: TEST_TENANT, slug: TEST_TENANT })
    // Phase 2 Task 2 修复：seed 默认 ProjectTypeConfig 让 daily-scan 走真实分档路径
    await seedDefaultTypeConfigs(prisma, TEST_TENANT)
  })

  afterAll(async () => {
    if (dbAvailable) await cleanupTestData(TEST_TENANT)
    await prisma.$disconnect()
  })

  it.skipIf(!dbAvailable)('detects stale projects', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Stale Project',
      projectType: 'default', // Phase 2 Task 2 修复：显式 default 档（staleDays=28），避免 software_mid 45 档防御性解除
      isStale: true,
      staleSince: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      healthScore: 50,
      milestone: 3,
    })

    const result = await runDailyScan(prisma, TEST_TENANT)

    expect(result.summary.staleProjects).toBeGreaterThanOrEqual(1)
    const alert = result.alerts.find((a) => a.entityId === project.id && a.type === 'STALE_PROJECT')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('HIGH')
  })

  it.skipIf(!dbAvailable)('detects overdue leads (createdAt > 60 天 → HIGH)', async () => {
    const lead = await createLead({
      tenantId: TEST_TENANT,
      name: 'Old Lead',
      status: 'FOLLOWING',
      createdAt: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000),
      completenessScore: 30,
    })

    const result = await runDailyScan(prisma, TEST_TENANT)
    const alert = result.alerts.find((a) => a.entityId === lead.id)
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('HIGH')
  })

  it.skipIf(!dbAvailable)('detects due tasks', async () => {
    const task = await createTask({
      tenantId: TEST_TENANT,
      title: 'Due Task',
      status: 'PENDING',
      priority: 'URGENT',
      deadline: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    })

    const result = await runDailyScan(prisma, TEST_TENANT)
    expect(result.summary.dueTasks).toBeGreaterThanOrEqual(1)
    const alert = result.alerts.find((a) => a.entityId === task.id)
    expect(alert).toBeDefined()
    expect(alert!.type).toBe('DUE_TASK')
    expect(alert!.severity).toBe('HIGH')
  })

  it.skipIf(!dbAvailable)('detects low health projects', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Sick Project',
      projectType: 'default',
      healthScore: 15,
      milestone: 2,
    })

    const result = await runDailyScan(prisma, TEST_TENANT)
    expect(result.summary.lowHealthProjects).toBeGreaterThanOrEqual(1)
    const alert = result.alerts.find((a) => a.entityId === project.id)
    expect(alert).toBeDefined()
    expect(alert!.type).toBe('LOW_HEALTH')
    expect(alert!.severity).toBe('HIGH')
  })

  it.skipIf(!dbAvailable)('detects projects missing effective follow-ups (tiered attentionDays)', async () => {
    // 默认档 attentionDays=14：立项 30 天无有效跟进 → 触发关注提醒
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'No Visit Project',
      projectType: 'default',
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      milestone: 1,
    })

    const result = await runDailyScan(prisma, TEST_TENANT)
    expect(result.summary.missingVisits).toBeGreaterThanOrEqual(1)
    const alert = result.alerts.find((a) => a.entityId === project.id && a.type === 'MISSING_VISIT')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('HIGH') // 30 天 > 默认档 staleDays 28
  })

  it.skipIf(!dbAvailable)('auto-marks stale per V6.1 tier: 立项超 staleDays 无有效跟进即停滞（默认档28天）', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Should Become Stale',
      projectType: 'default',
      isStale: false,
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      healthScore: 50,
      milestone: 3,
    })

    const result = await runDailyScan(prisma, TEST_TENANT)

    const updated = await prisma.project.findUnique({ where: { id: project.id } })
    expect(updated?.isStale).toBe(true)
    expect(updated?.staleSince).not.toBeNull()
    expect(updated?.staleReason).toContain('28天')

    expect(result.summary.staleProjects).toBeGreaterThanOrEqual(1)
    const staleAlert = result.alerts.find((a) => a.entityId === project.id && a.type === 'STALE_PROJECT')
    expect(staleAlert).toBeDefined()
  })

  it.skipIf(!dbAvailable)('V6.1：任务更新不再阻止停滞判定（只认有效跟进）', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Has Recent Task',
      projectType: 'default',
      isStale: false,
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      healthScore: 50,
      milestone: 3,
    })

    await createTask({
      tenantId: TEST_TENANT,
      projectId: project.id,
      status: 'PENDING',
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    })

    await runDailyScan(prisma, TEST_TENANT)

    const updated = await prisma.project.findUnique({ where: { id: project.id } })
    expect(updated?.isStale).toBe(true)
  })

  it.skipIf(!dbAvailable)('V6.1：等待客户中的项目暂停倒计时，不标停滞', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Waiting Project',
      projectType: 'default',
      isStale: false,
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      waitingStatus: 'awaiting_tender',
      waitingSince: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    })

    const result = await runDailyScan(prisma, TEST_TENANT)

    const updated = await prisma.project.findUnique({ where: { id: project.id } })
    expect(updated?.isStale).toBe(false)
    expect(result.summary.waitingSkipped).toBeGreaterThanOrEqual(1)
    expect(result.alerts.find((a) => a.entityId === project.id && a.type === 'MISSING_VISIT')).toBeUndefined()
  })

  it.skipIf(!dbAvailable)('V6.1：闭环且质量分达标的拜访重置停滞倒计时', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Effective Followup Project',
      projectType: 'default',
      isStale: false,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      healthScore: 50,
      milestone: 3,
    })

    const visit = await prisma.visit.create({
      data: {
        tenantId: TEST_TENANT,
        ownerId: project.ownerId,
        projectId: project.id,
        visitTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        visitType: 'offline',
      },
    })
    await prisma.visitClosure.create({
      data: {
        visitId: visit.id,
        projectId: project.id,
        ownerId: project.ownerId,
        closedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        qualityScore: 50, // ≥ 默认档 40 分门槛
      },
    })

    const result = await runDailyScan(prisma, TEST_TENANT)

    const updated = await prisma.project.findUnique({ where: { id: project.id } })
    expect(updated?.isStale).toBe(false)
    expect(result.alerts.find((a) => a.entityId === project.id && a.type === 'MISSING_VISIT')).toBeUndefined()
  })

  it.skipIf(!dbAvailable)('V6.1：闭环但质量分不达标（<40）不算有效跟进', async () => {
    const project = await createProject({
      tenantId: TEST_TENANT,
      name: 'Low Quality Closure Project',
      projectType: 'default',
      isStale: false,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      healthScore: 50,
      milestone: 3,
    })

    const visit = await prisma.visit.create({
      data: {
        tenantId: TEST_TENANT,
        ownerId: project.ownerId,
        projectId: project.id,
        visitTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        visitType: 'offline',
      },
    })
    await prisma.visitClosure.create({
      data: {
        visitId: visit.id,
        projectId: project.id,
        ownerId: project.ownerId,
        closedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        qualityScore: 25, // < 40 门槛
      },
    })

    await runDailyScan(prisma, TEST_TENANT)

    const updated = await prisma.project.findUnique({ where: { id: project.id } })
    expect(updated?.isStale).toBe(true)
  })

  it.skipIf(!dbAvailable)('sorts alerts by severity', async () => {
    await createProject({
      tenantId: TEST_TENANT,
      name: 'Low Priority',
      projectType: 'default',
      isStale: true,
      staleSince: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      healthScore: 60,
      milestone: 3,
    })

    await createProject({
      tenantId: TEST_TENANT,
      name: 'High Priority',
      projectType: 'default',
      healthScore: 10,
    })

    const result = await runDailyScan(prisma, TEST_TENANT)
    const highIndex = result.alerts.findIndex((a) => a.title.includes('High Priority'))
    const mediumIndex = result.alerts.findIndex((a) => a.title.includes('Low Priority'))
    expect(highIndex).toBeGreaterThanOrEqual(0)
    expect(mediumIndex).toBeGreaterThanOrEqual(0)
    expect(highIndex).toBeLessThan(mediumIndex)
  })
})