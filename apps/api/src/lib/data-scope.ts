import type { PrismaClient, UserRole } from '@prisma/client'

export interface AuthUser {
  id: string
  tenantId: string
  orgId: string
  role: UserRole
  email: string
}

export async function getDepartmentUserIds(prisma: PrismaClient, orgId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { orgId },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

/**
 * 根据角色构建数据范围过滤条件（用于列表查询）
 * - SUPER_ADMIN / TENANT_ADMIN：无额外过滤
 * - DEPT_HEAD：本部门所有用户的数据 + 公海池（ownerId 为 null）
 * - SALES：仅自己的数据
 */
export async function buildOwnerWhere(
  prisma: PrismaClient,
  user: AuthUser,
  baseWhere: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN') {
    return baseWhere
  }

  if (user.role === 'DEPT_HEAD') {
    const userIds = await getDepartmentUserIds(prisma, user.orgId)
    return {
      ...baseWhere,
      OR: [{ ownerId: { in: userIds } }, { ownerId: null }],
    }
  }

  // SALES and others
  return {
    ...baseWhere,
    ownerId: user.id,
  }
}

/**
 * 检查用户是否有权查看/操作某条数据
 * - SUPER_ADMIN / TENANT_ADMIN：始终有权
 * - DEPT_HEAD：数据属于本部门或公海池
 * - SALES：数据必须属于自己
 */
export async function canAccess(
  prisma: PrismaClient,
  user: AuthUser,
  ownerId: string | null | undefined,
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN') return true
  if (ownerId === null || ownerId === undefined) {
    // 公海池数据对 DEPT_HEAD 可见，对 SALES 不可操作（但列表可见）
    return user.role === 'DEPT_HEAD'
  }
  if (user.role === 'DEPT_HEAD') {
    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { orgId: true } })
    return owner?.orgId === user.orgId
  }
  return ownerId === user.id
}
