import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api.js'

export interface ActivityEvent {
  id: string
  tenantId: string
  customerId: string
  customerType?: string
  projectId?: string
  eventType: string
  eventSubtype?: string
  eventData: Record<string, unknown>
  sourceType: string
  sourceLabel?: string
  eventTime: string
  createdAt: string
  project?: { id: string; name: string }
}

export interface ActivityListResponse {
  items: ActivityEvent[]
  total: number
  page: number
  pageSize: number
}

export function useActivities(
  entityType: 'customer' | 'project',
  entityId?: string,
  page = 1,
  pageSize = 20,
) {
  return useQuery({
    queryKey: ['activities', entityType, entityId, page, pageSize],
    queryFn: () =>
      get<ActivityListResponse>(
        `/api/${entityType === 'customer' ? 'companies' : 'projects'}/${entityId}/activities?page=${page}&pageSize=${pageSize}`,
      ),
    enabled: !!entityId,
  })
}
