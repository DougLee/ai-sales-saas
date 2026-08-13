import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, patch, del } from '../lib/api.js'
import type { UserRole } from '@ai-sales/shared'

export interface UserItem {
  id: string
  email: string
  name: string
  role: UserRole
  status: string
  avatarUrl?: string
  orgId: string
  lastLoginAt?: string
  createdAt: string
}

export interface UsersFilters {
  role?: UserRole
  status?: 'active' | 'inactive'
  search?: string
  page?: number
  pageSize?: number
}

export interface UsersResponse {
  items: UserItem[]
  total: number
  page: number
  pageSize: number
}

export function useUsers(filters: UsersFilters = {}) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () =>
      get<UsersResponse>(
        '/api/users?' + new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined) as [string, string][]).toString()
      ),
    staleTime: 30 * 1000,
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<UserItem, 'name' | 'role' | 'status' | 'orgId'>> }) =>
      patch<UserItem>(`/api/users/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => del(`/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
    },
  })
}
