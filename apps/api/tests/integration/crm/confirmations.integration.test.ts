import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

// rubric B 轨走真实 LLM，集成测试中 mock 掉（E2E 单独验证真实评分）
vi.mock('@/crm/visits/rubric.service', () => ({
  scoreVisitWithRubric: vi.fn().mockResolvedValue(null),
}))

import { resolveItem, batchConfirm, createAutoAppliedItem } from '@/crm/confirmations/confirmations.service'
import { refreshClosure } from '@/crm/visits/closure.service'
import { createTenantPrisma } from '@/tenant/tenant-guard'
import { createProject, createUser, createTenant, cleanupTestData } from '../../factories'

const prisma = new PrismaClient()
const TEST_TENANT = 'integration-test-tenant'

let dbAvailable = false
try {
  await prisma.$queryRaw`SELECT 1`
  dbAvailable = true
} catch {
  console.warn('[confirmations integration] Database unavailable, skipping')
}

async function seedVisitWithPendingItems() {
  const user = await createUser({ tenantId: TEST_TENANT })
  const company = await prisma.company.create({
    data: { tenantId: TEST_TENANT, name: `Confirm Co ${Date.now()}` },
  })
  const project = await createProject({ tenantId: TEST_TENANT, ownerId: user.id, orgId: user.orgId, companyId: company.id })
  const visit = await prisma.visit.create({
    data: {
      tenantId: TEST_TENANT,
      ownerId: user.id,
      companyId: company.id,
      projectId: project.id,
      visitTime: new Date(),
      visitType: 'offline',
      rawInput: '销售速记：确认需求与预算，下周提交方案，决策需上办公会',
      rawInputType: 'recap',
    },
  })
  return { user, company, project, visit }
}

async function addPendingItem(visitId: string, projectId: string, ownerId: string, itemType: string, itemData: Record<string, unknown>) {
  return prisma.aiPendingItem.create({
    data: { tenantId: TEST_TENANT, ownerId, projectId, visitId, itemType, itemData },
  })
}

describe('confirmations integration (V6.1 节点4.5)', () => {
  beforeEach(async () => {
    if (!dbAvailable) return
    await cleanupTestData(TEST_TENANT)
    await createTenant({ id: TEST_TENANT, slug: TEST_TENANT })
  })

  afterAll(async () => {
    if (dbAvailable) await cleanupTestData(TEST_TENANT)
    await prisma.$disconnect()
  })

  it.skipIf(!dbAvailable)('确认 task → 落库为正式待办 + TASK_CREATED(confirmed) 事件', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    const item = await addPendingItem(visit.id, project.id, user.id, 'task', {
      title: '下周三前提交方案',
      description: '来自拜访分析的下一步行动建议',
      deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
    })

    await resolveItem(prisma, { itemId: item.id, action: 'confirm', userId: user.id, tenantId: TEST_TENANT })

    const task = await prisma.task.findFirst({ where: { tenantId: TEST_TENANT, title: '下周三前提交方案' } })
    expect(task).not.toBeNull()
    expect(task!.source).toBe('ai_visit_extraction')
    expect(task!.projectId).toBe(project.id)

    const event = await prisma.timelineEvent.findFirst({
      where: { tenantId: TEST_TENANT, eventType: 'TASK_CREATED', factStatus: 'confirmed' },
    })
    expect(event).not.toBeNull()

    const updated = await prisma.aiPendingItem.findUnique({ where: { id: item.id } })
    expect(updated!.status).toBe('confirmed')
    expect(updated!.resolvedBy).toBe(user.id)
  })

  it.skipIf(!dbAvailable)('confirm budget_signal → 写 project.financeInfo.budget', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    const item = await addPendingItem(visit.id, project.id, user.id, 'budget_signal', { content: '预算约80万' })

    await resolveItem(prisma, { itemId: item.id, action: 'confirm', userId: user.id, tenantId: TEST_TENANT })

    const updated = await prisma.project.findUnique({ where: { id: project.id } })
    expect((updated!.financeInfo as Record<string, unknown>).budget).toBe('预算约80万')
  })

  it.skipIf(!dbAvailable)('modify → 按微调内容落库，状态记 modified', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    const item = await addPendingItem(visit.id, project.id, user.id, 'task', { title: 'AI 原始标题' })

    await resolveItem(prisma, {
      itemId: item.id,
      action: 'modify',
      modifiedData: { title: '销售微调后的标题' },
      userId: user.id,
      tenantId: TEST_TENANT,
    })

    const task = await prisma.task.findFirst({ where: { tenantId: TEST_TENANT } })
    expect(task!.title).toBe('销售微调后的标题')
    const updated = await prisma.aiPendingItem.findUnique({ where: { id: item.id } })
    expect(updated!.status).toBe('modified')
  })

  it.skipIf(!dbAvailable)('全部处理完 → VISIT_CONFIRMED(confirmed) 事件 + 闭环 hasConfirmation', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    const t = await addPendingItem(visit.id, project.id, user.id, 'task', { title: '任务A' })
    const b = await addPendingItem(visit.id, project.id, user.id, 'budget_signal', { content: '50万' })
    const r = await addPendingItem(visit.id, project.id, user.id, 'key_request', { content: '要国产化适配' })

    await resolveItem(prisma, { itemId: t.id, action: 'confirm', userId: user.id, tenantId: TEST_TENANT })
    // 还有 pending → 不应有 VISIT_CONFIRMED
    let confirmedEvent = await prisma.timelineEvent.findFirst({
      where: { tenantId: TEST_TENANT, eventType: 'VISIT_CONFIRMED' },
    })
    expect(confirmedEvent).toBeNull()

    await resolveItem(prisma, { itemId: b.id, action: 'confirm', userId: user.id, tenantId: TEST_TENANT })
    await resolveItem(prisma, { itemId: r.id, action: 'reject', userId: user.id, tenantId: TEST_TENANT })

    confirmedEvent = await prisma.timelineEvent.findFirst({
      where: { tenantId: TEST_TENANT, eventType: 'VISIT_CONFIRMED' },
    })
    expect(confirmedEvent).not.toBeNull()
    expect(confirmedEvent!.factStatus).toBe('confirmed')
    const data = confirmedEvent!.eventData as Record<string, unknown>
    expect(data.confirmedCount).toBe(2)
    expect(data.rejectedCount).toBe(1)

    const closure = await prisma.visitClosure.findUnique({ where: { visitId: visit.id } })
    expect(closure!.hasConfirmation).toBe(true)
  })

  it.skipIf(!dbAvailable)('重复 resolve 幂等返回，不重复落库', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    const item = await addPendingItem(visit.id, project.id, user.id, 'task', { title: '幂等任务' })

    await resolveItem(prisma, { itemId: item.id, action: 'confirm', userId: user.id, tenantId: TEST_TENANT })
    await resolveItem(prisma, { itemId: item.id, action: 'confirm', userId: user.id, tenantId: TEST_TENANT })

    const tasks = await prisma.task.findMany({ where: { tenantId: TEST_TENANT, title: '幂等任务' } })
    expect(tasks).toHaveLength(1)
  })

  it.skipIf(!dbAvailable)('无权处理他人的待确认项', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    const other = await createUser({ tenantId: TEST_TENANT })
    const item = await addPendingItem(visit.id, project.id, user.id, 'task', { title: '别人的任务' })

    await expect(
      resolveItem(prisma, { itemId: item.id, action: 'confirm', userId: other.id, tenantId: TEST_TENANT }),
    ).rejects.toThrow('无权处理他人的待确认项')
  })

  it.skipIf(!dbAvailable)('batchConfirm 一键确认全部', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    await addPendingItem(visit.id, project.id, user.id, 'task', { title: '批量任务1' })
    await addPendingItem(visit.id, project.id, user.id, 'task', { title: '批量任务2' })
    await addPendingItem(visit.id, project.id, user.id, 'budget_signal', { content: '30万' })

    const result = await batchConfirm(prisma, { visitId: visit.id, userId: user.id, tenantId: TEST_TENANT })
    expect(result.confirmed).toBe(3)

    const remaining = await prisma.aiPendingItem.count({
      where: { tenantId: TEST_TENANT, visitId: visit.id, status: 'pending' },
    })
    expect(remaining).toBe(0)

    const tasks = await prisma.task.findMany({ where: { tenantId: TEST_TENANT } })
    expect(tasks).toHaveLength(2)

    const confirmedEvent = await prisma.timelineEvent.findFirst({
      where: { tenantId: TEST_TENANT, eventType: 'VISIT_CONFIRMED' },
    })
    expect(confirmedEvent).not.toBeNull()
  })

  // V6.2 分级信任：诉求/竞品自动生效 + 可撤销
  it.skipIf(!dbAvailable)('auto：key_request 创建即落库痛点列表，不占人工确认队列', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    const item = await createAutoAppliedItem(prisma, {
      tenantId: TEST_TENANT,
      ownerId: user.id,
      projectId: project.id,
      visitId: visit.id,
      itemType: 'key_request',
      itemData: { content: '设备兼容性问题' },
    })

    expect(item.status).toBe('auto')
    const updated = await prisma.project.findUnique({ where: { id: project.id } })
    expect((updated!.humanInfo as Record<string, unknown>).painPoints).toContain('设备兼容性问题')

    // 不产生待确认负担
    const pending = await prisma.aiPendingItem.count({ where: { tenantId: TEST_TENANT, status: 'pending' } })
    expect(pending).toBe(0)
  })

  it.skipIf(!dbAvailable)('auto：competitor_mention 与档案已有竞品去重', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    await prisma.project.update({
      where: { id: project.id },
      data: { businessInfo: { competitors: ['希沃'] } as never },
    })
    await createAutoAppliedItem(prisma, {
      tenantId: TEST_TENANT,
      ownerId: user.id,
      projectId: project.id,
      visitId: visit.id,
      itemType: 'competitor_mention',
      itemData: { content: '希沃' },
    })

    const updated = await prisma.project.findUnique({ where: { id: project.id } })
    expect((updated!.businessInfo as Record<string, unknown>).competitors).toEqual(['希沃'])
  })

  it.skipIf(!dbAvailable)('revoke：撤销自动录入，内容从档案移除；非 auto 状态不可撤销', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    const item = await createAutoAppliedItem(prisma, {
      tenantId: TEST_TENANT,
      ownerId: user.id,
      projectId: project.id,
      visitId: visit.id,
      itemType: 'competitor_mention',
      itemData: { content: '华为' },
    })
    let updated = await prisma.project.findUnique({ where: { id: project.id } })
    expect((updated!.businessInfo as Record<string, unknown>).competitors).toContain('华为')

    const revoked = await resolveItem(prisma, { itemId: item.id, action: 'revoke', userId: user.id, tenantId: TEST_TENANT })
    expect(revoked.status).toBe('revoked')
    updated = await prisma.project.findUnique({ where: { id: project.id } })
    expect((updated!.businessInfo as Record<string, unknown>).competitors).not.toContain('华为')

    // 已撤销不可再撤销
    await expect(
      resolveItem(prisma, { itemId: item.id, action: 'revoke', userId: user.id, tenantId: TEST_TENANT }),
    ).rejects.toThrow('仅自动录入的条目可撤销')

    // task 类型不支持撤销通道（走 reject）
    const t = await addPendingItem(visit.id, project.id, user.id, 'task', { title: 'x' })
    await expect(
      resolveItem(prisma, { itemId: t.id, action: 'revoke', userId: user.id, tenantId: TEST_TENANT }),
    ).rejects.toThrow()
  })

  it.skipIf(!dbAvailable)('batchConfirm 支持按 itemIds 整单确认（跨拜访）', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    const a = await addPendingItem(visit.id, project.id, user.id, 'task', { title: '整单任务1' })
    const b = await addPendingItem(visit.id, project.id, user.id, 'budget_signal', { content: '60万' })

    const result = await batchConfirm(prisma, { itemIds: [a.id, b.id], userId: user.id, tenantId: TEST_TENANT })
    expect(result.confirmed).toBe(2)
    const remaining = await prisma.aiPendingItem.count({ where: { tenantId: TEST_TENANT, status: 'pending' } })
    expect(remaining).toBe(0)
  })

  // V6.1 §十一 验收：一次完整拜访闭环，behavior_logs 恰有 1 条 visit_closure 记录
  // 回归：租户代理 upsert 曾把复合唯一键包进 AND 导致 Prisma 校验失败、积分静默丢失（Phase 3 E2E 抓到）
  it.skipIf(!dbAvailable)('完整闭环经租户代理写积分恰 1 条且幂等', async () => {
    const { user, project, visit } = await seedVisitWithPendingItems()
    // 六节点凑齐：prep 素材 / 原始输入 / AI 摘要 / AI 分析 / 跟进 / 无待确认项
    await prisma.visit.update({
      where: { id: visit.id },
      data: {
        attachments: [{ type: 'visit_prep', content: { objective: 'x' } }],
        summary: 'AI 扩写摘要：本次拜访确认了需求与预算，约80万，下周提交方案初稿。',
        aiAnalysis: { milestoneProgress: 'M2→M3' },
        nextActionDeadline: new Date(Date.now() + 3 * 86400000),
      },
    })

    const tenantPrisma = createTenantPrisma(prisma, {
      id: user.id,
      tenantId: TEST_TENANT,
      orgId: user.orgId!,
      role: 'SALES',
    })

    const c1 = await refreshClosure(tenantPrisma, visit.id, { actorUserId: user.id })
    expect(c1.closedAt).not.toBeNull()

    const logs1 = await prisma.behaviorLog.findMany({
      where: { tenantId: TEST_TENANT, visitId: visit.id, type: 'visit_closure' },
    })
    expect(logs1).toHaveLength(1)
    expect(logs1[0].score).toBeGreaterThan(0)

    // 再次刷新不重复写积分
    await refreshClosure(tenantPrisma, visit.id, { actorUserId: user.id })
    const logs2 = await prisma.behaviorLog.findMany({
      where: { tenantId: TEST_TENANT, visitId: visit.id, type: 'visit_closure' },
    })
    expect(logs2).toHaveLength(1)
  })
})
