import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import Fuse from 'fuse.js'

/**
 * 联系人实体写入服务（《智能体数据写入治理规范》§一 单一写入通道 + §五 实体防裂变）
 *
 * 智能体提取"新联系人"时必须走 findOrCreateContact：
 * 先模糊匹配已有记录（姓名+单位），匹配到则提议更新而非新建，
 * 防止同一联系人在库中裂变。
 */

export const UpsertContactSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(50),
  companyId: z.string().nullish(),
  position: z.string().max(50).nullish(),
  department: z.string().max(50).nullish(),
  phone: z.string().max(30).nullish(),
  email: z.string().email().max(100).nullish().or(z.literal('')),
  decisionRole: z.enum(['COACH', 'EVALUATOR', 'DECISION_MAKER', 'USER', 'GATEKEEPER']).nullish(),
  /** 人工录入传 false；默认 true（经服务层的新建多为 AI 提取，标记待人工熟悉） */
  aiTagged: z.boolean().nullish(),
})

export type UpsertContactInput = z.infer<typeof UpsertContactSchema>

export interface ContactMatch {
  contact: { id: string; name: string; position: string | null }
  score: number // 0-1，越低越相似（fuse.js 评分）
}

/**
 * 模糊查找同名联系人（同租户、同客户范围内优先）
 */
export async function findSimilarContacts(
  prisma: PrismaClient,
  opts: { tenantId: string; name: string; companyId?: string | null; limit?: number },
): Promise<ContactMatch[]> {
  const candidates = await prisma.contact.findMany({
    where: {
      tenantId: opts.tenantId,
      // 同客户下的全部联系人 + 全局同名（防跨客户重名误判，交由 score 排序）
      OR: [
        { companyId: opts.companyId ?? undefined },
        { name: { contains: opts.name } },
      ],
    },
    select: { id: true, name: true, position: true },
    take: 50,
  })
  if (candidates.length === 0) return []

  const fuse = new Fuse(candidates, { keys: ['name'], includeScore: true, threshold: 0.4 })
  return fuse
    .search(opts.name)
    .slice(0, opts.limit ?? 3)
    .map((r) => ({ contact: r.item, score: r.score ?? 1 }))
}

/**
 * 查找或创建联系人（防裂变写入口）
 *
 * 返回 { contact, created, matches }：
 * - created=true：新建
 * - created=false：复用了高置信匹配（score ≤ 0.2 视为同一人）
 * - matches：可疑重复列表，供确认界面展示"是否同一人？"
 */
export async function findOrCreateContact(
  prisma: PrismaClient,
  rawInput: UpsertContactInput,
) {
  const input = UpsertContactSchema.parse(rawInput)

  const matches = await findSimilarContacts(prisma, {
    tenantId: input.tenantId,
    name: input.name,
    companyId: input.companyId,
  })

  // 高置信匹配：直接复用（并补齐缺失字段）
  const confident = matches.find((m) => m.score <= 0.2)
  if (confident) {
    const contact = await prisma.contact.update({
      where: { id: confident.contact.id },
      data: {
        position: input.position ?? undefined,
        department: input.department ?? undefined,
        phone: input.phone ?? undefined,
        email: input.email || undefined,
      },
    })
    return { contact, created: false, matches }
  }

  const contact = await prisma.contact.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      companyId: input.companyId ?? null,
      position: input.position ?? null,
      department: input.department ?? null,
      phone: input.phone ?? null,
      email: input.email || null,
      decisionRole: input.decisionRole ?? null,
      aiTagged: input.aiTagged ?? true,
    },
  })
  return { contact, created: true, matches }
}
