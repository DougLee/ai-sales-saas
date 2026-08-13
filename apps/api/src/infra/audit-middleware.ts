/**
 * Audit - V3.1 操作审计 + 登录历史
 *
 * 设计：
 * - controller 显式调 logAudit() 记录关键操作
 * - ctx 通过参数传入（不用 module-level 变量，避免并发覆盖）
 * - 失败不影响业务（catch 住）
 * - 敏感字段不进 changes（passwordHash / apiKey 等）
 *
 * 关于 Prisma $use middleware（暂未启用）：
 * - Prisma 6.19 client 上 $use 不可用（具体原因暂未查清）
 * - V3.2 再用 Prisma Client Extensions 重做自动捕获
 */

import type { FastifyRequest } from 'fastify'
import type { PrismaClient } from '@prisma/client'

/** 请求上下文（从 req 派生） */
export interface AuditContext {
  userId: string | null
  userEmail: string | null
  tenantId: string | null
  ip: string
  userAgent: string
}

/** 从 FastifyRequest 派生 AuditContext */
export function ctxFromRequest(req: FastifyRequest): AuditContext {
  const user = req.user as { id?: string; tenantId?: string; email?: string } | undefined
  return {
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    tenantId: user?.tenantId ?? null,
    ip: req.ip || (req.socket as { remoteAddress?: string | null } | undefined)?.remoteAddress || 'unknown',
    userAgent: (req.headers['user-agent'] as string) || 'unknown',
  }
}

/** 工具：手动记录审计日志 */
export async function logAudit(
  prisma: PrismaClient,
  ctx: AuditContext,
  data: {
    action: string
    entity: string
    entityId?: string | null
    description?: string
    changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> }
    severity?: 'info' | 'warning' | 'critical'
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  try {
    if (!ctx.tenantId) return  // 没有 tenantId 不写

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId ?? undefined,
        description: data.description,
        changes: data.changes as object | undefined,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        severity: data.severity ?? 'info',
        metadata: data.metadata as object | undefined,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[AuditLog] failed:', (err as Error).message)
  }
}

// 旧 API 不再导出（已用 controller 显式 logAudit 替代 Prisma middleware）
