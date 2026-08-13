import { PrismaClient } from '@prisma/client'
import type { UserRole } from '@prisma/client'

export interface TenantUser {
  id: string
  tenantId: string
  orgId: string
  role: UserRole
}

/**
 * 根据用户角色构建基础 where 条件
 * - SUPER_ADMIN / TENANT_ADMIN: 可看全租户数据
 * - DEPT_HEAD: 看本部门数据（orgId 匹配）
 * - SALES / VIEWER: 只看自己owner的数据
 *
 * @param modelKey Prisma 模型名，用于区分 ownerId / orgId / uploadedBy 等字段
 */
export function buildWhereClause(user: TenantUser, modelKey?: string): Record<string, unknown> {
  const base: Record<string, unknown> = { tenantId: user.tenantId }

  switch (user.role) {
    case 'SUPER_ADMIN':
    case 'TENANT_ADMIN':
      return base
    case 'DEPT_HEAD': {
      // 部门主管按 orgId 隔离本部门数据
      if (user.orgId && modelKey && MODELS_WITH_ORG_ID.has(modelKey)) {
        base.orgId = user.orgId
      }
      return base
    }
    case 'SALES':
    case 'VIEWER':
    default: {
      if (modelKey === 'kbDocument') {
        base.uploadedBy = user.id
      } else if (modelKey === 'timelineEvent') {
        // TimelineEvent 按 ownerId 隔离
        base.ownerId = user.id
      } else if (modelKey && MODELS_WITH_OWNER_ID.has(modelKey)) {
        base.ownerId = user.id
      }
      return base
    }
  }
}

/**
 * 将租户隔离条件与现有 where 用 AND 合并
 */
export function withTenantIsolation<T extends Record<string, unknown>>(
  user: TenantUser,
  baseWhere: T = {} as T,
  modelKey?: string
): T & { AND: [T, Record<string, unknown>] } {
  const tenantWhere = buildWhereClause(user, modelKey)
  return {
    ...baseWhere,
    AND: [baseWhere, tenantWhere],
  } as T & { AND: [T, Record<string, unknown>] }
}

const TENANT_SENSITIVE_MODELS = new Set([
  'project',
  'lead',
  'contact',
  'visit',
  'task',
  'company',
  'timelineEvent',
  'customerSnapshot',
  'kbDocument',
  'behaviorLog',
  'chatSession',
  'chatMessage',
])

/** 拥有 ownerId 字段的模型 — 创建时自动注入 ownerId */
const MODELS_WITH_OWNER_ID = new Set([
  'project',
  'lead',
  'visit',
  'visitClosure',
  'task',
])

/** 拥有 orgId 字段的模型 — 创建时自动注入 orgId（DEPT_HEAD 隔离用） */
const MODELS_WITH_ORG_ID = new Set([
  'project',
  'lead',
  'visit',
  'task',
  'timelineEvent',
])

/** 拥有 uploadedBy 字段的模型 — 创建时自动注入 uploadedBy */
const MODELS_WITH_UPLOADED_BY = new Set([
  'kbDocument',
])

const READ_METHODS = new Set([
  'findMany',
  'findFirst',
  'findUnique',
  'count',
  'groupBy',
  'aggregate',
])

const WRITE_METHODS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
])

/**
 * 为 Prisma Client 创建 Proxy，自动注入 tenant_id 隔离
 * 适用于 Fastify 请求生命周期：在 onRequest 中挂载到 req 上
 */
export function createTenantPrisma(
  prisma: PrismaClient,
  user: TenantUser
): PrismaClient {
  return new Proxy(prisma, {
    get(target, modelKey: string) {
      const model = target[modelKey as keyof PrismaClient]
      if (typeof model !== 'object' || model === null) {
        return model
      }

      const isSensitive = TENANT_SENSITIVE_MODELS.has(modelKey)
      if (!isSensitive) {
        return model
      }

      return new Proxy(model, {
        get(modelTarget, methodKey: string) {
          const method = modelTarget[methodKey as keyof typeof modelTarget]
          if (typeof method !== 'function') {
            return method
          }

          if (methodKey === 'findUnique') {
            return (args: Record<string, unknown> = {}) => {
              // findUnique 不支持 AND/OR/NOT，直接用 findFirst 替代
              const baseWhere = (args.where || {}) as Record<string, unknown>
              const tenantWhere = buildWhereClause(user, modelKey)
              const where = { ...baseWhere, ...tenantWhere }
              return ((modelTarget as any).findFirst as (...args: unknown[]) => unknown).call(modelTarget, { ...args, where })
            }
          }

          if (READ_METHODS.has(methodKey)) {
            return (args: Record<string, unknown> = {}) => {
              const where = withTenantIsolation(user, args.where as Record<string, unknown>, modelKey)
              return ((method as unknown) as (...args: unknown[]) => unknown).call(modelTarget, { ...args, where })
            }
          }

          if (WRITE_METHODS.has(methodKey)) {
            return (args: Record<string, unknown> = {}) => {
              // create / upsert 等需要强制 tenantId / ownerId / uploadedBy / orgId
              if (methodKey === 'create' && args.data) {
                const data = args.data as Record<string, unknown>
                if (!data.tenantId) data.tenantId = user.tenantId
                if (MODELS_WITH_OWNER_ID.has(modelKey) && !data.ownerId && !data.userId) {
                  data.ownerId = user.id
                }
                if (MODELS_WITH_ORG_ID.has(modelKey) && !data.orgId && user.orgId) {
                  data.orgId = user.orgId
                }
                if (MODELS_WITH_UPLOADED_BY.has(modelKey) && !data.uploadedBy) {
                  data.uploadedBy = user.id
                }
                // TimelineEvent 必须注入 ownerId 和 orgId（文档 V4 RBAC 要求）
                if (modelKey === 'timelineEvent') {
                  if (!data.ownerId) data.ownerId = user.id
                  if (!data.orgId && user.orgId) data.orgId = user.orgId
                }
              }
              if (methodKey === 'createMany' && args.data) {
                const items = args.data as Record<string, unknown>[]
                items.forEach((item) => {
                  if (!item.tenantId) item.tenantId = user.tenantId
                })
              }
              if (methodKey === 'update' || methodKey === 'updateMany') {
                const where = withTenantIsolation(user, args.where as Record<string, unknown>, modelKey)
                return ((method as unknown) as (...args: unknown[]) => unknown).call(modelTarget, { ...args, where })
              }
              if (methodKey === 'delete' || methodKey === 'deleteMany') {
                const where = withTenantIsolation(user, args.where as Record<string, unknown>, modelKey)
                return ((method as unknown) as (...args: unknown[]) => unknown).call(modelTarget, { ...args, where })
              }
              if (methodKey === 'upsert') {
                const upsertArgs = args as Record<string, unknown>
                const create = (upsertArgs.create as Record<string, unknown>) || {}
                if (!create.tenantId) create.tenantId = user.tenantId
                if (MODELS_WITH_OWNER_ID.has(modelKey) && !create.ownerId && !create.userId) {
                  create.ownerId = user.id
                }
                if (MODELS_WITH_ORG_ID.has(modelKey) && !create.orgId && user.orgId) {
                  create.orgId = user.orgId
                }
                if (MODELS_WITH_UPLOADED_BY.has(modelKey) && !create.uploadedBy) {
                  create.uploadedBy = user.id
                }
                // TimelineEvent 必须注入 ownerId 和 orgId
                if (modelKey === 'timelineEvent') {
                  if (!create.ownerId) create.ownerId = user.id
                  if (!create.orgId && user.orgId) create.orgId = user.orgId
                }
                // upsert 的 where 是 WhereUniqueInput：复合唯一键（如 unique_visit_closure_log）
                // 不能塞进 AND（普通 WhereInput 不接受复合键），租户条件平铺到顶层
                // （extendedWhereUnique：唯一选择器可与普通字段过滤共存）
                const baseWhere = (upsertArgs.where as Record<string, unknown>) || {}
                const tenantWhere = buildWhereClause(user, modelKey)
                const where = { ...baseWhere, ...tenantWhere }
                return ((method as unknown) as (...args: unknown[]) => unknown).call(modelTarget, { ...upsertArgs, create, where })
              }
              return ((method as unknown) as (...args: unknown[]) => unknown).call(modelTarget, args)
            }
          }

          return method
        },
      })
    },
  }) as PrismaClient
}
