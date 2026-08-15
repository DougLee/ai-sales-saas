import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { buildOwnerWhere } from '../lib/data-scope.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string; orgId: string; role: string }
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfWeek(date: Date) {
  const d = new Date(date)
  const day = d.getDay() || 7
  if (day !== 1) d.setHours(-24 * (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date)
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

export async function getStats(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const now = new Date()
    const weekStart = startOfWeek(now)
    const weekEnd = endOfWeek(now)

    const [
      newLeadsThisWeek,
      activeProjects,
      pendingVisits,
      staleProjects,
      avgHealthScore,
      milestoneDistribution,
      urgentProjects,
    ] = await Promise.all([
      prisma.lead.count({
        where: { deletedAt: null, createdAt: { gte: weekStart, lte: weekEnd } },
      }),
      prisma.project.count({
        where: { closedAt: null, deletedAt: null },
      }),
      prisma.visit.count({
        where: { nextActionDeadline: { gte: now } },
      }),
      prisma.project.count({
        where: { isStale: true, deletedAt: null },
      }),
      prisma.project.aggregate({
        where: { closedAt: null, deletedAt: null },
        _avg: { healthScore: true },
      }),
      prisma.project.groupBy({
        by: ['milestone'],
        where: { closedAt: null, deletedAt: null },
        _count: { id: true },
      }),
      prisma.project.findMany({
        where: {
          closedAt: null,
          deletedAt: null,
          urgency: { in: ['HIGH', 'CRITICAL'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          urgency: true,
          healthScore: true,
          milestone: true,
          company: { select: { name: true } },
        },
      }),
    ])

    const milestoneMap = Array.from({ length: 9 }, (_, i) => {
      const found = milestoneDistribution.find((m) => m.milestone === i)
      return {
        name: `M${i}`,
        label: [
          '初识客户',
          '明确痛点',
          '明确需求',
          '明确经费',
          '明确方案',
          '明确价格',
          '协助采购',
          '招标确认',
          '投标中标',
        ][i],
        count: found?._count.id || 0,
      }
    })

    reply.send({
      success: true,
      data: {
        newLeadsThisWeek,
        activeProjects,
        pendingVisits,
        staleProjects,
        avgHealthScore: Math.round(avgHealthScore._avg.healthScore || 0),
        milestoneDistribution: milestoneMap,
        urgentProjects,
      },
    })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function getMe(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const now = new Date()
    const todayStart = startOfDay(now)

    const taskBaseWhere = await buildOwnerWhere(prisma, user as never, {
      status: { not: 'COMPLETED' },
    })

    const projectBaseWhere = await buildOwnerWhere(prisma, user as never, {
      deletedAt: null,
      closedAt: null,
    })

    const leadBaseWhere = await buildOwnerWhere(prisma, user as never, {
      deletedAt: null,
      status: 'FOLLOWING',
    })

    const visitBaseWhere = await buildOwnerWhere(prisma, user as never, {
      nextActionDeadline: { gte: now },
    })

    const [tasks, projects, leads, pendingVisits] = await Promise.all([
      prisma.task.findMany({
        where: {
          ...taskBaseWhere,
          // 防御性过滤：排除关联实体已被软删除的孤儿任务
          AND: [
            {
              OR: [
                { projectId: null },
                { project: { deletedAt: null } },
              ],
            },
            {
              OR: [
                { companyId: null },
                { company: { deletedAt: null } },
              ],
            },
          ],
        },
        orderBy: [{ priority: 'asc' }, { deadline: 'asc' }],
        take: 50,
        // 今日作战页按客户聚合战役（issue #34）：任务带客户归属（task.company 优先，回退 project.company）
        include: {
          project: { select: { id: true, name: true, company: { select: { id: true, name: true } } } },
          company: { select: { id: true, name: true } },
        },
      }),
      prisma.project.findMany({
        where: projectBaseWhere,
        orderBy: { updatedAt: 'desc' },
        take: 30,
        include: {
          company: { select: { name: true } },
          tasks: {
            where: { status: { not: 'COMPLETED' }, source: 'agent_gate_blocked' },
            take: 1,
            select: { id: true },
          },
        },
      }),
      prisma.lead.findMany({
        where: leadBaseWhere,
        orderBy: [{ lastFollowUpAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
        take: 20,
      }),
      prisma.visit.count({ where: visitBaseWhere }),
    ])

    const todayTasks = {
      overdue: [] as typeof tasks,
      dueToday: [] as typeof tasks,
      highPriority: [] as typeof tasks,
      pending: [] as typeof tasks,
    }

    for (const task of tasks) {
      const deadline = task.deadline ? new Date(task.deadline) : null
      if (deadline && deadline < todayStart) {
        todayTasks.overdue.push(task)
      } else if (deadline && isSameDay(deadline, now)) {
        todayTasks.dueToday.push(task)
      } else if (task.priority === 'HIGH' || task.priority === 'URGENT') {
        todayTasks.highPriority.push(task)
      } else {
        todayTasks.pending.push(task)
      }
    }

    const stuckProjects = {
      gateBlocked: [] as typeof projects,
      stale: [] as typeof projects,
      lowHealth: [] as typeof projects,
      urgent: [] as typeof projects,
    }

    for (const project of projects) {
      if (project.tasks.length > 0) {
        stuckProjects.gateBlocked.push(project)
      } else if (project.isStale) {
        stuckProjects.stale.push(project)
      } else if ((project.healthScore ?? 100) < 40) {
        stuckProjects.lowHealth.push(project)
      } else if (project.urgency === 'HIGH' || project.urgency === 'CRITICAL') {
        stuckProjects.urgent.push(project)
      }
    }

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const followUpLeads = {
      active: [] as typeof leads,
      longOverdue: [] as typeof leads,
    }

    for (const lead of leads) {
      const isLongOverdue =
        new Date(lead.createdAt) < thirtyDaysAgo &&
        (!lead.lastFollowUpAt || new Date(lead.lastFollowUpAt) < thirtyDaysAgo)
      if (isLongOverdue) {
        followUpLeads.longOverdue.push(lead)
      } else {
        followUpLeads.active.push(lead)
      }
    }

    const counts = {
      totalTasks: tasks.length,
      overdueTasks: todayTasks.overdue.length,
      stuckProjects:
        stuckProjects.gateBlocked.length +
        stuckProjects.stale.length +
        stuckProjects.lowHealth.length +
        stuckProjects.urgent.length,
      followUpLeads: followUpLeads.active.length + followUpLeads.longOverdue.length,
      pendingVisits,
    }

    reply.send({
      success: true,
      data: {
        todayTasks,
        stuckProjects,
        followUpLeads,
        counts,
      },
    })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}
