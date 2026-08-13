import type { PrismaClient } from '@prisma/client'

/**
 * 任务级联清理工具
 *
 * 当 Lead / Project / Company 被软删除，或 Visit 被硬删除时，
 * 把它们历史产生的、且尚未完成的任务标记为 CANCELLED 并解绑关联外键。
 *
 * 这样可以避免「删除实体后任务还在今日任务列表里显示」的问题。
 *
 * 使用方式：
 *   await prisma.$transaction(async (tx) => {
 *     await cancelTasksForEntity(tx, { projectId: project.id })
 *     await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } })
 *   })
 */

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export interface CleanupTarget {
  projectId?: string | null
  leadId?: string | null
  companyId?: string | null
  visitId?: string | null
}

/**
 * 将与已删除实体关联的、尚未完成的任务标记为 CANCELLED，并解绑外键。
 *
 * 任务取消条件：status NOT IN ('COMPLETED', 'CANCELLED')
 *
 * 支持的关联来源：
 * - projectId：删除 Project 时
 * - companyId：删除 Company 时（Task 通过 companyId 关联 Company）
 * - visitId：删除 Visit 时（按 source='visit_analysis'/'visit_next_action' + sourceId 匹配）
 */
export async function cancelTasksForEntity(
  tx: TxClient,
  target: CleanupTarget,
): Promise<number> {
  const orFilters: Array<Record<string, unknown>> = []

  if (target.projectId) {
    orFilters.push({ projectId: target.projectId })
  }

  if (target.companyId) {
    orFilters.push({ companyId: target.companyId })
  }

  if (target.leadId) {
    // 线索自身没有外键关联 Task，但 lead_follow_up / daily_scan_OVERDUE_LEAD 等
    // 任务可能通过 sourceId 指向线索 id，因此这里按 source/sourceId 兜底清理
    orFilters.push({
      AND: [
        { sourceId: target.leadId },
        { source: { in: ['lead_follow_up', 'daily_scan_OVERDUE_LEAD'] } },
      ],
    })
  }

  if (target.visitId) {
    // 拜访硬删后清理 AI 分析产生的 nextActions 任务
    orFilters.push({
      AND: [
        { sourceId: target.visitId },
        { source: { in: ['visit_analysis', 'visit_next_action'] } },
      ],
    })
  }

  if (orFilters.length === 0) return 0

  const result = await tx.task.updateMany({
    where: {
      OR: orFilters,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    data: {
      status: 'CANCELLED',
      projectId: target.projectId ? null : undefined,
      companyId: target.companyId ? null : undefined,
    },
  })

  return result.count
}