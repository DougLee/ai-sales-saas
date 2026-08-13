import { useAuthUser } from './use-auth.js'
import type { UserRole } from '@ai-sales/shared'

export function useHasRole(...roles: UserRole[]): boolean {
  const { data: user } = useAuthUser()
  if (!user) return false
  return roles.includes(user.role as UserRole)
}

export function useIsAdmin(): boolean {
  return useHasRole('TENANT_ADMIN', 'SUPER_ADMIN')
}

export function useCanManageUsers(): boolean {
  return useIsAdmin()
}

export function useCanAssign(): boolean {
  return useHasRole('TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD')
}
