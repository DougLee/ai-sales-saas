import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api.js'
import type { UserRole } from '@ai-sales/shared'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  avatarUrl?: string
  tenantId: string
  orgId: string
  lastLoginAt?: string
}

export function useAuthUser() {
  return useQuery({
    queryKey: ['auth-me'],
    queryFn: () => get<AuthUser>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
