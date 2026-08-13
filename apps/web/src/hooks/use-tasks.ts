import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, patch, del } from '../lib/api.js'
import { invalidateTaskRelated } from '../lib/invalidation.js'
import { toast } from '../lib/toast.js'

export interface Task {
  id: string
  title: string
  description?: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  projectId?: string
  source?: string
  sourceId?: string
  deadline?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  project?: { id: string; name: string; company?: { id: string; name: string } | null } | null
  company?: { id: string; name: string } | null
}

export function useTasks(params?: {
  status?: string
  projectId?: string
  priority?: string
  deadlineFrom?: string
  deadlineTo?: string
  isOverdue?: boolean
}) {
  const queryString = new URLSearchParams()
  if (params?.status) queryString.set('status', params.status)
  if (params?.projectId) queryString.set('projectId', params.projectId)
  if (params?.priority) queryString.set('priority', params.priority)
  if (params?.deadlineFrom) queryString.set('deadlineFrom', params.deadlineFrom)
  if (params?.deadlineTo) queryString.set('deadlineTo', params.deadlineTo)
  if (params?.isOverdue) queryString.set('isOverdue', 'true')

  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () =>
      get<{ items: Task[] }>(
        `/api/tasks?${queryString.toString()}`
      ),
    refetchInterval: 30_000,
  })
}

export function useTask(id?: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => get<Task>(`/api/tasks/${id}`),
    enabled: !!id,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Task>) =>
      post<{ item: Task }>('/api/tasks', data),
    onSuccess: () => {
      invalidateTaskRelated(qc)
      toast.success('任务创建成功')
    },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) =>
      put<{ item: Task }>(`/api/tasks/${id}`, data),
    onSuccess: (_res, vars) => {
      invalidateTaskRelated(qc, vars.id)
      toast.success('任务更新成功')
    },
    onError: (err) => toast.error((err as Error).message || '更新失败'),
  })
}

export function useCompleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      patch<{ item: Task }>(`/api/tasks/${id}/complete`),
    onSuccess: (_res, id) => {
      invalidateTaskRelated(qc, id)
      toast.success('任务已完成')
    },
    onError: (err) => toast.error((err as Error).message || '操作失败'),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del(`/api/tasks/${id}`),
    onSuccess: () => {
      invalidateTaskRelated(qc)
      toast.success('任务已删除')
    },
    onError: (err) => toast.error((err as Error).message || '删除失败'),
  })
}
