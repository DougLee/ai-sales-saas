import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post } from '../lib/api.js'
import { toast } from '../lib/toast.js'

export interface AlertItem {
  id: string
  type: 'STALE_PROJECT' | 'OVERDUE_LEAD' | 'DUE_TASK' | 'LOW_HEALTH' | 'MISSING_VISIT'
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  title: string
  description: string
  entityType: 'project' | 'lead' | 'task'
  entityId: string
  entityName: string
  createdAt: string
  read?: boolean
  metadata?: Record<string, unknown>
}

export interface AlertSummary {
  staleProjects: number
  overdueLeads: number
  dueTasks: number
  lowHealthProjects: number
  missingVisits: number
}

export interface AlertsData {
  scanTime: string
  totalAlerts: number
  unreadCount: number
  alerts: AlertItem[]
  summary: AlertSummary
}

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => get<AlertsData>('/api/alerts'),
  })
}

export function useUnreadAlerts() {
  return useQuery({
    queryKey: ['alerts', 'unread-count'],
    queryFn: () => get<{ unreadCount: number }>('/api/alerts/unread-count'),
    refetchInterval: 60_000,
  })
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      post<{ id: string; read: boolean }>(`/api/alerts/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alerts', 'unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useMarkAllAlertsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => post<{ readCount: number }>('/api/alerts/read-all'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alerts', 'unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`已标记 ${res.readCount} 条预警为已读`)
    },
    onError: (err) => toast.error((err as Error).message || '标记失败'),
  })
}
