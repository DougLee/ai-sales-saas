/**
 * #33 A3 + A2：Prisma Client Extension（query callback，Prisma 6.x 正式支持，替代废弃的 $use middleware）
 *
 * A3 审计闭环：Company / Lead / Project 三核心实体的 create / update / delete
 *   自动写 AuditLog（复用 infra/audit-middleware.ts 的 logAudit），失败不阻塞主流程。
 *   注意：扩展层无请求上下文（userId=null，ip='prisma-extension'），人工关键操作仍由 controller 显式 logAudit。
 *
 * A2 软删级联：Project / Company / Lead 被软删（update 传 deletedAt 非空）或硬删时，
 *   关联 Visit 统一软删（deletedAt=now，不物理删，录音合规数据保留）。
 *   Task 已由 controller 的 cancelTasksForEntity 处理（取消+解绑），此处不重复。
 *
 * 实现说明：
 * - 审计/级联写走传入的 base client（与扩展 client 同一连接池，但不经本扩展 → 无递归）
 * - 不拦截 AuditLog / ChangeHistory / LoginHistory；updateMany 不拦截
 *   （现有删除链路均走单条 update，最小增量取舍；审计写在事务外，尽力而为不回滚）
 */

import type { PrismaClient } from '@prisma/client'
import { logAudit, type AuditContext } from './audit-middleware.js'

type AuditedModel = 'company' | 'lead' | 'project'
type WriteAction = 'CREATE' | 'UPDATE' | 'DELETE'

const ENTITY_NAME: Record<AuditedModel, string> = {
  company: 'Company',
  lead: 'Lead',
  project: 'Project',
}

/** 软删/硬删父实体时，Visit 的关联外键字段 */
const VISIT_FK: Record<AuditedModel, 'companyId' | 'leadId' | 'projectId'> = {
  company: 'companyId',
  lead: 'leadId',
  project: 'projectId',
}

const ACTION_LABEL: Record<WriteAction, string> = {
  CREATE: '创建',
  UPDATE: '更新',
  DELETE: '删除',
}

/** 扩展回调参数（宽松结构：只用到 args / query，Prisma 6 类型定义不含 client 字段） */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface QueryHandlerParams {
  args: any
  query: (...args: any[]) => Promise<any>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** 写审计（tenantId 取自结果行；失败只打日志不抛出 —— logAudit 内部已 catch） */
async function writeAudit(
  internal: PrismaClient,
  model: AuditedModel,
  action: WriteAction,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
  updatedFields?: string[],
): Promise<void> {
  if (!result || typeof result.id !== 'string') return
  const ctx: AuditContext = {
    userId: null, // 扩展层无请求上下文；人工操作由 controller 显式 logAudit 补充
    userEmail: null,
    tenantId: typeof result.tenantId === 'string' ? result.tenantId : null,
    ip: 'prisma-extension',
    userAgent: 'prisma-client-extension',
  }
  await logAudit(internal, ctx, {
    action,
    entity: ENTITY_NAME[model],
    entityId: result.id,
    description: `${ACTION_LABEL[action]}${ENTITY_NAME[model]}：${result.name ?? result.id}`,
    metadata: {
      via: 'prisma-extension',
      ...(updatedFields && updatedFields.length > 0 ? { updatedFields } : {}),
    },
  })
}

/** 父实体删除/软删 → 关联 Visit 软删（幂等：只更新未删行；失败不阻塞） */
async function cascadeSoftDeleteVisits(
  internal: PrismaClient,
  model: AuditedModel,
  entityId: string,
): Promise<void> {
  await internal.visit.updateMany({
    where: { [VISIT_FK[model]]: entityId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

function auditedModelHandlers(internal: PrismaClient, model: AuditedModel) {
  return {
    async create({ args, query }: QueryHandlerParams) {
      const result = await query(args)
      await writeAudit(internal, model, 'CREATE', result)
      return result
    },

    async update({ args, query }: QueryHandlerParams) {
      const softDeleting =
        args?.data && typeof args.data === 'object' && 'deletedAt' in args.data && args.data.deletedAt != null
      const result = await query(args)
      // A2：软删父实体 → 级联软删关联 Visit（在主写成功后执行，尽力而为）
      if (softDeleting && typeof result?.id === 'string') {
        try {
          await cascadeSoftDeleteVisits(internal, model, result.id)
        } catch {
          // 级联失败不回滚主流程（与旧行为一致：父删子未删）
        }
      }
      // 只记字段名不记值（敏感字段排除沿用 logAudit 口径：不落 changes）
      const updatedFields = args?.data && typeof args.data === 'object' ? Object.keys(args.data) : undefined
      await writeAudit(internal, model, 'UPDATE', result, updatedFields)
      return result
    },

    async delete({ args, query }: QueryHandlerParams) {
      // 先级联软删 Visit（硬删后外键被置空，事后匹配不到行）
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const delegate = (internal as any)[model]
        const existing = await delegate.findUnique({ where: args?.where, select: { id: true } })
        if (existing?.id) await cascadeSoftDeleteVisits(internal, model, existing.id)
      } catch {
        // 预读/级联失败则跳过
      }
      const result = await query(args)
      await writeAudit(internal, model, 'DELETE', result)
      return result
    },
  }
}

/**
 * 给 PrismaClient 挂上数据底座扩展（审计 + 软删级联）。
 * 返回 $extends 后的 client（类型收窄回 PrismaClient，便于 tenant-guard Proxy 透传）。
 */
export function withDataFoundation(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      company: auditedModelHandlers(client, 'company'),
      lead: auditedModelHandlers(client, 'lead'),
      project: auditedModelHandlers(client, 'project'),
    },
  }) as unknown as PrismaClient
}
