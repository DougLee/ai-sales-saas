import type { PrismaClient } from '@prisma/client'
import { recordTimelineEvent } from '../../lib/timeline.js'
import { ActivityEventType } from '../../lib/activity.js'
import { createTask } from '../../lib/entity-services/task.service.js'
import { refreshClosure } from '../visits/closure.service.js'

/**
 * AI 待确认产物消费服务（V6.1 §5.2 节点4.5 / 《智能体数据写入治理规范》§三）
 *
 * 三态生命周期：pending → confirmed / modified / rejected
 * - confirm：按 AI 提取原样落库
 * - modify：按销售微调后的内容落库（resolvedData 记微调结果）
 * - reject：丢弃，只留审计痕迹
 *
 * 确认后的落库动作按 itemType 分发（applyConfirmedItem）：
 * - first_contact    → project.humanInfo.firstContact（仅在为空时写入）
 * - solution_summary → project.businessInfo.solution（仅在为空时写入）
 * - price_quote      → project.financeInfo.price（仅在为空时写入）
 * - bid_result       → project.evidence.bidResult（仅在为空时写入）
 * - task              → 实体服务层 createTask + TASK_CREATED(confirmed) 事件
 * - task_package      → #42 归类确认：1 个主线任务（title=首动作，description=编号步骤清单，
 *                       priority=MEDIUM，deadline=继承 nextActionDeadline 无则 +7 天）；
 *                       modifiedData.standaloneActions 里是「单开」逃生门拆出的独立步骤
 * - budget_signal     → project.financeInfo.budget（仅在为空时写入）
 * - key_request       → project.humanInfo.painPoints 追加
 * - competitor_mention → project.businessInfo.competitors 追加
 * - pain_points_group  → #42 类级批 payload：painPoints 数组批量追加（已存在的跳过）
 * - competitors_group  → #42 类级批 payload：competitors 数组批量追加（已存在的跳过）
 * - decision_chain    → project.decisionMap（仅在为空时写入）
 *
 * 一次拜访的待确认项全部处理完 → 写 VISIT_CONFIRMED(confirmed) 事件 + 刷新闭环
 */

export type ResolveAction = 'confirm' | 'modify' | 'reject' | 'revoke'

/** V6.2 分级信任：低风险类型（首次接触方式/方案要点/报价/中标结果/诉求/竞品/决策链）自动生效、不进人工确认队列，错了可 revoke 撤回
 *  #42 起诉求/竞品升级为类级批 payload（pain_points_group / competitors_group），仍属自动类 */
export const AUTO_APPLY_TYPES = ['first_contact', 'solution_summary', 'price_quote', 'bid_result', 'key_request', 'competitor_mention', 'decision_chain', 'pain_points_group', 'competitors_group'] as const

/**
 * 读侧兼容（#42）：旧单条 AiPendingItem 没有 items/actions 包装，
 * 统一包装为单元素数组，确认/展示行为与旧单条一致。
 */
export function normalizeGroupItems(data: unknown): string[] {
  const d = (data || {}) as Record<string, unknown>
  if (Array.isArray(d.items)) {
    return d.items.map((v) => String(v ?? '').trim()).filter(Boolean)
  }
  const single = String(d.content ?? d.title ?? '').trim()
  return single ? [single] : []
}

/** 任务包步骤（读侧兼容同上：无 actions 包装时回落 title/content 单元素） */
export interface PackageAction {
  title: string
  deadline?: string
}

export function normalizePackageActions(data: unknown): PackageAction[] {
  const d = (data || {}) as Record<string, unknown>
  if (Array.isArray(d.actions)) {
    return d.actions
      .map((v) => {
        const a = (v || {}) as Record<string, unknown>
        const title = String(a.title ?? '').trim()
        const deadline = a.deadline ? String(a.deadline) : undefined
        return { title, deadline }
      })
      .filter((a) => a.title)
  }
  const single = String(d.title ?? d.content ?? '').trim()
  return single ? [{ title: single }] : []
}

/** 任务包截止：继承 nextActionDeadline（取包级与各步骤中最早的可解析时间），无则 +7 天 */
function resolvePackageDeadline(data: Record<string, unknown>): Date {
  const candidates: string[] = []
  if (data.deadline) candidates.push(String(data.deadline))
  for (const a of normalizePackageActions(data)) {
    if (a.deadline) candidates.push(a.deadline)
  }
  const times = candidates
    .map((v) => new Date(v).getTime())
    .filter((t) => !Number.isNaN(t) && t > 0)
  return times.length ? new Date(Math.min(...times)) : new Date(Date.now() + 7 * 86400000)
}

interface PendingItemLike {
  id: string
  tenantId: string
  ownerId: string
  projectId: string | null
  visitId: string | null
  itemType: string
  itemData: unknown
  status?: string
}

/** 确认/微调后的正式落库（唯一事实写入口；V6.2 起 auto 类型也复用此入口即时落库） */
export async function applyConfirmedItem(
  prisma: PrismaClient,
  item: PendingItemLike,
  finalData: Record<string, unknown>,
  userId: string,
) {
  const project = item.projectId
    ? await prisma.project.findFirst({ where: { id: item.projectId, tenantId: item.tenantId } })
    : null

  switch (item.itemType) {
    case 'first_contact': {
      if (!project) return {}
      const humanInfo = (project.humanInfo as Record<string, unknown>) || {}
      if (!humanInfo.firstContact) {
        await prisma.project.update({
          where: { id: project.id },
          data: { humanInfo: { ...humanInfo, firstContact: String(finalData.content || '') } as never },
        })
      }
      return {}
    }

    case 'solution_summary': {
      if (!project) return {}
      const businessInfo = (project.businessInfo as Record<string, unknown>) || {}
      if (!businessInfo.solution) {
        await prisma.project.update({
          where: { id: project.id },
          data: { businessInfo: { ...businessInfo, solution: String(finalData.content || '') } as never },
        })
      }
      return {}
    }

    case 'price_quote': {
      if (!project) return {}
      const financeInfo = (project.financeInfo as Record<string, unknown>) || {}
      if (!financeInfo.price) {
        await prisma.project.update({
          where: { id: project.id },
          data: { financeInfo: { ...financeInfo, price: String(finalData.content || '') } as never },
        })
      }
      return {}
    }

    case 'bid_result': {
      if (!project) return {}
      const evidence = (project.evidence as Record<string, unknown>) || {}
      if (!evidence.bidResult) {
        await prisma.project.update({
          where: { id: project.id },
          data: { evidence: { ...evidence, bidResult: String(finalData.content || '') } as never },
        })
      }
      return {}
    }

    case 'task': {
      const task = await createTask(prisma, {
        tenantId: item.tenantId,
        orgId: project?.orgId,
        ownerId: item.ownerId,
        title: String(finalData.title || ''),
        description: typeof finalData.description === 'string' ? finalData.description : undefined,
        priority: 'HIGH',
        source: 'ai_visit_extraction',
        sourceId: item.visitId || undefined,
        deadline: finalData.deadline
          ? new Date(String(finalData.deadline))
          : new Date(Date.now() + 3 * 86400000),
        projectId: item.projectId,
      })
      if (project) {
        await recordTimelineEvent(prisma, {
          tenantId: item.tenantId,
          customerId: project.companyId || '',
          projectId: project.id,
          eventType: ActivityEventType.TASK_CREATED,
          eventData: { title: task.title, priority: task.priority, source: 'ai_visit_extraction', sourceId: item.visitId },
          factStatus: 'confirmed',
          sourceType: 'user',
          sourceId: userId,
          sourceLabel: '确认 AI 提取的待办',
        })
      }
      return { taskId: task.id }
    }

    case 'task_package': {
      // #42 任务包：一包一主线任务（步骤清单进 description 编号列表），不再逐条灌任务。
      // modifiedData.standaloneActions = 「单开任务」逃生门拆出的独立步骤（上限与主线合计 ≤2 个任务）
      const actions = normalizePackageActions(finalData)
      const standalone = normalizePackageActions({ actions: finalData.standaloneActions })
      if (actions.length === 0 && standalone.length === 0) return {}

      const deadline = resolvePackageDeadline(finalData)
      let mainTaskId: string | undefined
      const createdTitles: string[] = []

      if (actions.length > 0) {
        const title = String(finalData.title || '').trim() || actions[0].title
        const task = await createTask(prisma, {
          tenantId: item.tenantId,
          orgId: project?.orgId,
          ownerId: item.ownerId,
          title,
          description: actions.map((a, i) => `${i + 1}. ${a.title}`).join('\n'),
          priority: 'MEDIUM',
          source: 'ai_visit_extraction',
          sourceId: item.visitId || undefined,
          deadline,
          projectId: item.projectId,
        })
        mainTaskId = task.id
        createdTitles.push(task.title)
      }

      for (const step of standalone) {
        const task = await createTask(prisma, {
          tenantId: item.tenantId,
          orgId: project?.orgId,
          ownerId: item.ownerId,
          title: step.title,
          description: '从拜访任务包拆出的独立跟进步骤',
          priority: 'MEDIUM',
          source: 'ai_visit_extraction',
          sourceId: item.visitId || undefined,
          deadline: step.deadline ? new Date(step.deadline) : deadline,
          projectId: item.projectId,
        })
        createdTitles.push(task.title)
      }

      if (project) {
        await recordTimelineEvent(prisma, {
          tenantId: item.tenantId,
          customerId: project.companyId || '',
          projectId: project.id,
          eventType: ActivityEventType.TASK_CREATED,
          eventData: {
            title: createdTitles[0],
            packageSteps: actions.map((a) => a.title),
            standaloneSteps: standalone.map((a) => a.title),
            priority: 'MEDIUM',
            source: 'ai_visit_extraction',
            sourceId: item.visitId,
          },
          factStatus: 'confirmed',
          sourceType: 'user',
          sourceId: userId,
          sourceLabel: '确认 AI 提取的任务包',
        })
      }
      return mainTaskId ? { taskId: mainTaskId } : {}
    }

    case 'budget_signal': {
      if (!project) return {}
      const financeInfo = (project.financeInfo as Record<string, unknown>) || {}
      if (!financeInfo.budget) {
        await prisma.project.update({
          where: { id: project.id },
          data: { financeInfo: { ...financeInfo, budget: finalData.content } as never },
        })
      }
      return {}
    }

    case 'key_request': {
      if (!project) return {}
      const humanInfo = (project.humanInfo as Record<string, unknown>) || {}
      const existing = Array.isArray(humanInfo.painPoints) ? (humanInfo.painPoints as unknown[]) : []
      if (!existing.includes(finalData.content)) {
        await prisma.project.update({
          where: { id: project.id },
          data: { humanInfo: { ...humanInfo, painPoints: [...existing, finalData.content] } as never },
        })
      }
      return {}
    }

    case 'competitor_mention': {
      if (!project) return {}
      const businessInfo = (project.businessInfo as Record<string, unknown>) || {}
      const existing = Array.isArray(businessInfo.competitors) ? (businessInfo.competitors as unknown[]) : []
      if (!existing.includes(finalData.content)) {
        await prisma.project.update({
          where: { id: project.id },
          data: { businessInfo: { ...businessInfo, competitors: [...existing, finalData.content] } as never },
        })
      }
      return {}
    }

    case 'pain_points_group': {
      // #42 类级批 payload：一次提取的 N 条诉求合并为 1 条 item，确认/自动生效时批量追加
      if (!project) return {}
      const humanInfo = (project.humanInfo as Record<string, unknown>) || {}
      const existing = Array.isArray(humanInfo.painPoints) ? (humanInfo.painPoints as unknown[]) : []
      const additions = normalizeGroupItems(finalData).filter((p) => !existing.includes(p))
      if (additions.length > 0) {
        await prisma.project.update({
          where: { id: project.id },
          data: { humanInfo: { ...humanInfo, painPoints: [...existing, ...additions] } as never },
        })
      }
      return {}
    }

    case 'competitors_group': {
      // #42 类级批 payload：一次提取的 N 个竞品合并为 1 条 item，确认/自动生效时批量追加
      if (!project) return {}
      const businessInfo = (project.businessInfo as Record<string, unknown>) || {}
      const existing = Array.isArray(businessInfo.competitors) ? (businessInfo.competitors as unknown[]) : []
      const additions = normalizeGroupItems(finalData).filter((c) => !existing.includes(c))
      if (additions.length > 0) {
        await prisma.project.update({
          where: { id: project.id },
          data: { businessInfo: { ...businessInfo, competitors: [...existing, ...additions] } as never },
        })
      }
      return {}
    }

    case 'decision_chain': {
      if (!project) return {}
      const existingMap = (project.decisionMap as Record<string, unknown>) || {}
      const existingNodes = Array.isArray(existingMap.nodes) ? (existingMap.nodes as unknown[]) : []
      if (existingNodes.length > 0) return {}
      const chain = Array.isArray(finalData.chain) ? finalData.chain : []
      const decisionMap = {
        nodes: chain.map((c, idx) => {
          const node = c as Record<string, unknown>
          return { id: `contact_${idx}`, name: node.name, role: node.role, attitude: node.attitude }
        }),
        relations: [],
      }
      await prisma.project.update({
        where: { id: project.id },
        data: { decisionMap: decisionMap as never },
      })
      return {}
    }

    default:
      // 未知类型：只标记确认，不做落库动作（内容已随 VISIT_CONFIRMED 事件沉淀）
      return {}
  }
}

/** 该拜访的待确认项全部处理完 → 写确认事件 + 刷新闭环 */
async function finalizeVisitConfirmation(
  prisma: PrismaClient,
  item: PendingItemLike,
  userId: string,
) {
  if (!item.visitId) return

  const remaining = await prisma.aiPendingItem.count({
    where: { tenantId: item.tenantId, visitId: item.visitId, status: 'pending' },
  })
  if (remaining > 0) return

  const allResolved = await prisma.aiPendingItem.findMany({
    where: { tenantId: item.tenantId, visitId: item.visitId },
  })
  const confirmed = allResolved.filter((i) => i.status !== 'rejected')
  const rejected = allResolved.filter((i) => i.status === 'rejected')

  const visit = await prisma.visit.findUnique({ where: { id: item.visitId }, select: { companyId: true } })

  await recordTimelineEvent(prisma, {
    tenantId: item.tenantId,
    customerId: visit?.companyId || '',
    projectId: item.projectId || undefined,
    eventType: ActivityEventType.VISIT_CONFIRMED,
    eventData: {
      visitId: item.visitId,
      confirmedCount: confirmed.length,
      rejectedCount: rejected.length,
      confirmedItems: confirmed.map((i) => ({
        itemType: i.itemType,
        finalContent: i.resolvedData,
        wasModified: i.status === 'modified',
      })),
      rejectedItems: rejected.map((i) => ({ itemType: i.itemType, original: i.itemData })),
      confirmedBy: userId,
    },
    factStatus: 'confirmed',
    sourceType: 'user',
    sourceId: userId,
    sourceLabel: '拜访内容确认',
  })

  // 确认完成 → 刷新闭环（has_confirmation 节点此时才可能打勾）
  await refreshClosure(prisma, item.visitId, { actorUserId: userId })
}

/**
 * V6.2 分级信任：低风险类型（诉求/竞品）自动生效。
 * 仍写 AiPendingItem（status='auto'）作审计与撤销锚点，但立即落库，不占人工确认队列。
 */
export async function createAutoAppliedItem(
  prisma: PrismaClient,
  opts: {
    tenantId: string
    ownerId: string
    projectId: string | null
    visitId: string | null
    itemType: string
    itemData: Record<string, unknown>
  },
) {
  const item = await prisma.aiPendingItem.create({
    data: {
      tenantId: opts.tenantId,
      ownerId: opts.ownerId,
      projectId: opts.projectId,
      visitId: opts.visitId,
      itemType: opts.itemType,
      itemData: opts.itemData as never,
      status: 'auto',
      resolvedAt: new Date(),
    },
  })
  await applyConfirmedItem(prisma, item, opts.itemData, '')
  return item
}

/** 撤销自动录入：把 content 从项目档案数组里撤掉（applyConfirmedItem 的逆操作）
 *  #42 类级条目默认按批撤销；modifiedData.items 为「保留清单」（弹层可挑单条保留） */
async function revokeAutoItem(
  prisma: PrismaClient,
  item: PendingItemLike,
  userId: string,
  modifiedData?: Record<string, unknown>,
) {
  if (item.status !== 'auto') throw new Error('仅自动录入的条目可撤销')
  if (!(AUTO_APPLY_TYPES as readonly string[]).includes(item.itemType)) {
    throw new Error('该类型不支持撤销')
  }
  const content = String((item.itemData as Record<string, unknown>)?.content ?? '')
  const project = item.projectId
    ? await prisma.project.findFirst({ where: { id: item.projectId, tenantId: item.tenantId } })
    : null

  if (!project) {
    return prisma.aiPendingItem.update({
      where: { id: item.id },
      data: { status: 'revoked', resolvedBy: userId, resolvedAt: new Date() },
    })
  }

  if (item.itemType === 'decision_chain') {
    const decisionMap = (project.decisionMap as Record<string, unknown>) || {}
    const chain = Array.isArray((item.itemData as Record<string, unknown>)?.chain)
      ? ((item.itemData as Record<string, unknown>).chain as Array<Record<string, unknown>>)
      : []
    const currentNodes = Array.isArray(decisionMap.nodes) ? (decisionMap.nodes as Array<Record<string, unknown>>) : []
    const matches = chain.length > 0
      && currentNodes.length === chain.length
      && currentNodes.every((node, idx) => {
        const expected = chain[idx]
        return node?.name === expected?.name && node?.role === expected?.role
      })
    if (matches) {
      await prisma.project.update({
        where: { id: project.id },
        data: { decisionMap: { ...decisionMap, nodes: [] } as never },
      })
    }
  } else if (item.itemType === 'first_contact') {
      const humanInfo = (project.humanInfo as Record<string, unknown>) || {}
      if (humanInfo.firstContact === content) {
        await prisma.project.update({
          where: { id: project.id },
          data: { humanInfo: { ...humanInfo, firstContact: null } as never },
        })
      }
    } else if (item.itemType === 'solution_summary') {
      const businessInfo = (project.businessInfo as Record<string, unknown>) || {}
      if (businessInfo.solution === content) {
        await prisma.project.update({
          where: { id: project.id },
          data: { businessInfo: { ...businessInfo, solution: null } as never },
        })
      }
    } else if (item.itemType === 'price_quote') {
      const financeInfo = (project.financeInfo as Record<string, unknown>) || {}
      if (financeInfo.price === content) {
        await prisma.project.update({
          where: { id: project.id },
          data: { financeInfo: { ...financeInfo, price: null } as never },
        })
      }
    } else if (item.itemType === 'bid_result') {
      const evidence = (project.evidence as Record<string, unknown>) || {}
      if (evidence.bidResult === content) {
        await prisma.project.update({
          where: { id: project.id },
          data: { evidence: { ...evidence, bidResult: null } as never },
        })
      }
    } else if (item.itemType === 'key_request') {
      const humanInfo = (project.humanInfo as Record<string, unknown>) || {}
      const list = Array.isArray(humanInfo.painPoints) ? (humanInfo.painPoints as unknown[]) : []
      await prisma.project.update({
        where: { id: project.id },
        data: { humanInfo: { ...humanInfo, painPoints: list.filter((p) => p !== content) } as never },
      })
    } else if (item.itemType === 'competitor_mention') {
      const businessInfo = (project.businessInfo as Record<string, unknown>) || {}
      const list = Array.isArray(businessInfo.competitors) ? (businessInfo.competitors as unknown[]) : []
      await prisma.project.update({
        where: { id: project.id },
        data: { businessInfo: { ...businessInfo, competitors: list.filter((c) => c !== content) } as never },
      })
    } else if (item.itemType === 'pain_points_group' || item.itemType === 'competitors_group') {
      // #42 按批撤销：默认撤掉本批全部条目；modifiedData.items 里的保留
      const batch = normalizeGroupItems(item.itemData)
      const keep = modifiedData ? normalizeGroupItems(modifiedData) : []
      const remove = batch.filter((v) => !keep.includes(v))
      if (item.itemType === 'pain_points_group') {
        const humanInfo = (project.humanInfo as Record<string, unknown>) || {}
        const list = Array.isArray(humanInfo.painPoints) ? (humanInfo.painPoints as unknown[]) : []
        await prisma.project.update({
          where: { id: project.id },
          data: { humanInfo: { ...humanInfo, painPoints: list.filter((p) => !remove.includes(String(p))) } as never },
        })
      } else {
        const businessInfo = (project.businessInfo as Record<string, unknown>) || {}
        const list = Array.isArray(businessInfo.competitors) ? (businessInfo.competitors as unknown[]) : []
        await prisma.project.update({
          where: { id: project.id },
          data: { businessInfo: { ...businessInfo, competitors: list.filter((c) => !remove.includes(String(c))) } as never },
        })
      }
    }

  return prisma.aiPendingItem.update({
    where: { id: item.id },
    data: { status: 'revoked', resolvedBy: userId, resolvedAt: new Date() },
  })
}

/**
 * 处理单条待确认项（confirm / modify / reject / revoke）
 * 返回更新后的 item；非 pending 状态重复调用幂等返回现状
 */
export async function resolveItem(
  prisma: PrismaClient,
  opts: { itemId: string; action: ResolveAction; modifiedData?: Record<string, unknown>; userId: string; tenantId: string },
) {
  const item = await prisma.aiPendingItem.findFirst({
    where: { id: opts.itemId, tenantId: opts.tenantId },
  })
  if (!item) throw new Error('待确认项不存在')
  if (item.ownerId !== opts.userId) throw new Error('无权处理他人的待确认项')

  // 撤销自动录入（status='auto' 专属通道；类级条目可用 modifiedData.items 挑单条保留）
  if (opts.action === 'revoke') {
    return revokeAutoItem(prisma, item, opts.userId, opts.modifiedData)
  }

  if (item.status !== 'pending') return item // 幂等：已处理过直接返回

  const finalData = (opts.action === 'modify' ? opts.modifiedData : item.itemData) as Record<string, unknown>

  if (opts.action !== 'reject') {
    await applyConfirmedItem(prisma, item, finalData || {}, opts.userId)
  }

  const updated = await prisma.aiPendingItem.update({
    where: { id: item.id },
    data: {
      status: opts.action === 'reject' ? 'rejected' : opts.action === 'modify' ? 'modified' : 'confirmed',
      resolvedData: opts.action === 'reject' ? undefined : (finalData as never),
      resolvedBy: opts.userId,
      resolvedAt: new Date(),
    },
  })

  await finalizeVisitConfirmation(prisma, item, opts.userId)
  return updated
}

/**
 * 一键确认：某次拜访的全部待确认项（visitId），或指定条目集合（itemIds，用于按项目/线索维度的整单确认）
 * （V6.1：单次拜访确认 < 30 秒的关键路径）
 */
export async function batchConfirm(
  prisma: PrismaClient,
  opts: { visitId?: string; itemIds?: string[]; userId: string; tenantId: string },
) {
  const items = await prisma.aiPendingItem.findMany({
    where: {
      tenantId: opts.tenantId,
      ownerId: opts.userId,
      status: 'pending',
      ...(opts.itemIds ? { id: { in: opts.itemIds } } : { visitId: opts.visitId }),
    },
  })
  let confirmed = 0
  for (const item of items) {
    await resolveItem(prisma, { itemId: item.id, action: 'confirm', userId: opts.userId, tenantId: opts.tenantId })
    confirmed++
  }
  return { confirmed }
}
