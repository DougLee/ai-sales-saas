import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'

/**
 * 客户批量操作（ADR-0001 决策 2）：本期只做批量认领 + 批量分配负责人。
 * 导出 / 移入公海不做（前端按钮置灰）。
 *
 * 与单个 claim/assign 同口径：认领写 ownerId+assignedAt+status='following'，
 * 分配需 TENANT_ADMIN / SUPER_ADMIN / DEPT_HEAD 角色，逐条写时间轴事件。
 */

const BATCH_LIMIT = 50

const BatchSchema = z.object({
  action: z.enum(['claim', 'assign']),
  ids: z.array(z.string().min(1)).min(1).max(BATCH_LIMIT),
  ownerId: z.string().optional(),
})

export async function batch(req: FastifyRequest, reply: FastifyReply) {
  try {
    const parsed = BatchSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: `参数不合法（单次最多 ${BATCH_LIMIT} 家）`,
      })
    }
    const { action, ids, ownerId } = parsed.data
    const prisma = req.tenantPrisma!
    const user = req.user as { id: string; tenantId: string; role: string }

    if (action === 'assign' && !['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD'].includes(user.role)) {
      return reply.status(403).send({ success: false, error: '无权分配客户' })
    }
    if (action === 'assign' && !ownerId) {
      return reply.status(400).send({ success: false, error: 'assign 需要指定 ownerId' })
    }

    const companies = await prisma.company.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true, ownerId: true },
    })

    let updated = 0
    let skipped = 0
    for (const company of companies) {
      if (action === 'claim') {
        // 与单个认领同规则：只能认领无主客户，已归属跳过（幂等）
        if (company.ownerId != null) {
          skipped++
          continue
        }
        const item = await prisma.company.update({
          where: { id: company.id },
          data: { ownerId: user.id, assignedAt: new Date(), status: 'following' },
        })
        await recordTimelineEvent(prisma, {
          tenantId: user.tenantId,
          customerId: item.id,
          eventType: ActivityEventType.COMPANY_ASSIGNED,
          eventData: { name: item.name, ownerId: item.ownerId, batch: true },
          sourceType: 'user',
          sourceId: user.id,
          sourceLabel: '批量认领客户',
        })
      } else {
        // assign：已在目标名下跳过（幂等）
        if (ownerId && company.ownerId === ownerId) {
          skipped++
          continue
        }
        const item = await prisma.company.update({
          where: { id: company.id },
          data: { ownerId: ownerId || null, assignedAt: ownerId ? new Date() : null },
        })
        await recordTimelineEvent(prisma, {
          tenantId: user.tenantId,
          customerId: item.id,
          eventType: ActivityEventType.COMPANY_OWNER_CHANGED,
          eventData: {
            name: item.name,
            ownerId: item.ownerId,
            previousOwnerId: company.ownerId,
            batch: true,
          },
          sourceType: 'user',
          sourceId: user.id,
          sourceLabel: ownerId ? '批量分配客户负责人' : '批量释放客户回公海池',
        })
      }
      updated++
    }

    // 传入 id 中不存在/已删除的部分计为 skipped
    skipped += ids.length - companies.length

    reply.send({ success: true, data: { updated, skipped } })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
