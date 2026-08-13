import type { PrismaClient } from '@prisma/client'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'

/**
 * 跟进提醒任务生成器
 * 基于 Project.nextFollowUp 和 Visit.nextActionDeadline 自动生成待办任务
 */
export async function createFollowUpReminders(
  prisma: PrismaClient,
  tenantId: string,
  now: Date,
): Promise<{ projectReminders: number; visitReminders: number }> {
  let projectReminders = 0
  let visitReminders = 0

  // 1. Project.nextFollowUp 到期提醒
  const projectsDue = await prisma.project.findMany({
    where: {
      tenantId,
      closedAt: null,
      deletedAt: null,
      nextFollowUp: { lte: now },
    },
    include: { company: { select: { id: true, name: true } } },
    take: 100,
  })

  for (const project of projectsDue) {
    const source = 'project_next_follow_up'
    const existing = await prisma.task.findFirst({
      where: {
        tenantId,
        source,
        sourceId: project.id,
        status: { not: 'COMPLETED' },
      },
    })
    if (existing) continue

    await prisma.task.create({
      data: {
        tenantId,
        orgId: project.orgId ?? null,
        ownerId: project.ownerId,
        title: `跟进提醒：${project.name}`,
        description: `客户 ${project.company?.name || '未知客户'} 的商机 ${project.name} 计划于 ${project.nextFollowUp?.toLocaleString('zh-CN')} 跟进。当前阶段 M${project.milestone}。`,
        priority: 'HIGH',
        status: 'PENDING',
        source,
        sourceId: project.id,
        projectId: project.id,
        deadline: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
      },
    })

    await recordTimelineEvent(prisma, {
      tenantId,
      customerId: project.companyId || '',
      projectId: project.id,
      eventType: ActivityEventType.TASK_CREATED,
      eventData: { title: `跟进提醒：${project.name}`, source },
      sourceType: 'system',
      sourceLabel: 'nextFollowUp 到期提醒',
      eventTime: now,
    })

    projectReminders++
  }

  // 2. Visit.nextActionDeadline 到期提醒
  const visitsDue = await prisma.visit.findMany({
    where: {
      tenantId,
      nextActionDeadline: { lte: now },
      workflowStage: { not: 'CLOSED' },
    },
    include: { project: { select: { id: true, name: true, companyId: true, company: { select: { name: true } } } } },
    take: 100,
  })

  for (const visit of visitsDue) {
    const source = 'visit_next_action'
    const existing = await prisma.task.findFirst({
      where: {
        tenantId,
        source,
        sourceId: visit.id,
        status: { not: 'COMPLETED' },
      },
    })
    if (existing) continue

    await prisma.task.create({
      data: {
        tenantId,
        orgId: visit.orgId ?? null,
        ownerId: visit.ownerId,
        title: `拜访后续行动到期：${visit.nextAction || visit.project?.name || '未命名拜访'}`,
        description: `客户 ${visit.project?.company?.name || '未知客户'} 的拜访（${new Date(visit.visitTime).toLocaleString('zh-CN')}）的后续行动已到期。`,
        priority: 'HIGH',
        status: 'PENDING',
        source,
        sourceId: visit.id,
        projectId: visit.projectId || undefined,
        deadline: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
      },
    })

    if (visit.project) {
      await recordTimelineEvent(prisma, {
        tenantId,
        customerId: visit.project.companyId || '',
        projectId: visit.project.id,
        eventType: ActivityEventType.TASK_CREATED,
        eventData: { title: `拜访后续行动到期：${visit.nextAction || visit.project.name}`, source },
        sourceType: 'system',
        sourceLabel: '拜访后续行动到期提醒',
        eventTime: now,
      })
    }

    visitReminders++
  }

  return { projectReminders, visitReminders }
}

/**
 * 公海池客户认领后 72 小时未触达，自动释放回公海池并通知主管
 */
export async function releaseUnclaimedCompanies(
  prisma: PrismaClient,
  tenantId: string,
  now: Date,
): Promise<number> {
  const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000)

  const companies = await prisma.company.findMany({
    where: {
      tenantId,
      ownerId: { not: null },
      assignedAt: { lt: seventyTwoHoursAgo },
      deletedAt: null,
    },
    take: 50,
  })

  let releasedCount = 0

  for (const company of companies) {
    const [recentProjects, recentVisits, recentTasks] = await Promise.all([
      prisma.project.count({
        where: {
          companyId: company.id,
          createdAt: { gte: seventyTwoHoursAgo },
          deletedAt: null,
        },
      }),
      prisma.visit.count({
        where: {
          project: { companyId: company.id },
          createdAt: { gte: seventyTwoHoursAgo },
        },
      }),
      prisma.task.count({
        where: {
          project: { companyId: company.id },
          createdAt: { gte: seventyTwoHoursAgo },
        },
      }),
    ])

    // 72 小时内有 project/visit/task，则认为已触达
    if (recentProjects > 0 || recentVisits > 0 || recentTasks > 0) continue

    const previousOwnerId = company.ownerId

    await prisma.company.update({
      where: { id: company.id },
      data: { ownerId: null, assignedAt: null },
    })

    await recordTimelineEvent(prisma, {
      tenantId,
      customerId: company.id,
      eventType: ActivityEventType.COMPANY_OWNER_CHANGED,
      eventData: {
        name: company.name,
        previousOwnerId,
        ownerId: null,
        reason: '认领后 72 小时未触达，自动释放',
      },
      sourceType: 'system',
      sourceLabel: '公海池自动释放',
      eventTime: now,
    })

    // 通知主管
    const managers = await prisma.user.findMany({
      where: { tenantId, role: { in: ['TENANT_ADMIN', 'DEPT_HEAD'] } },
      select: { id: true, orgId: true },
    })

    for (const manager of managers) {
      await prisma.task.create({
        data: {
          tenantId,
          orgId: manager.orgId ?? null,
          ownerId: manager.id,
          title: `客户释放回公海池：${company.name}`,
          description: `${company.name} 被认领后 72 小时未触达，已自动释放回公海池。`,
          priority: 'MEDIUM',
          status: 'PENDING',
          source: 'company_unclaimed_release',
          sourceId: company.id,
          deadline: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        },
      })
    }

    releasedCount++
  }

  return releasedCount
}

/**
 * 停滞项目超过 3 天未恢复，通知负责人和主管
 */
export async function notifyStaleProjects(
  prisma: PrismaClient,
  tenantId: string,
  now: Date,
): Promise<number> {
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const projects = await prisma.project.findMany({
    where: {
      tenantId,
      closedAt: null,
      deletedAt: null,
      isStale: true,
      staleSince: { lt: threeDaysAgo },
    },
    include: { company: { select: { id: true, name: true } } },
    take: 50,
  })

  let notifiedCount = 0

  for (const project of projects) {
    const source = 'stale_project_notify'
    const existing = await prisma.task.findFirst({
      where: {
        tenantId,
        source,
        sourceId: project.id,
        status: { not: 'COMPLETED' },
      },
    })
    if (existing) continue

    const staleDays = Math.floor(
      (now.getTime() - new Date(project.staleSince!).getTime()) / (1000 * 60 * 60 * 24),
    )

    // 给负责人创建任务
    await prisma.task.create({
      data: {
        tenantId,
        orgId: project.orgId ?? null,
        ownerId: project.ownerId,
        title: `项目停滞超 3 天需关注：${project.name}`,
        description: `客户 ${project.company?.name || '未知客户'} 的商机 ${project.name} 已停滞 ${staleDays} 天，建议尽快安排跟进。`,
        priority: 'HIGH',
        status: 'PENDING',
        source,
        sourceId: project.id,
        projectId: project.id,
        deadline: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
      },
    })

    // 通知主管
    const managers = await prisma.user.findMany({
      where: { tenantId, role: { in: ['TENANT_ADMIN', 'DEPT_HEAD'] } },
      select: { id: true, orgId: true },
    })

    for (const manager of managers) {
      await prisma.task.create({
        data: {
          tenantId,
          orgId: manager.orgId ?? null,
          ownerId: manager.id,
          title: `[主管关注] 项目停滞超 3 天：${project.name}`,
          description: `负责人 ${project.ownerId} 负责的商机 ${project.name} 已停滞超过 3 天。`,
          priority: 'HIGH',
          status: 'PENDING',
          source,
          sourceId: project.id,
          projectId: project.id,
          deadline: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
        },
      })
    }

    notifiedCount++
  }

  return notifiedCount
}
