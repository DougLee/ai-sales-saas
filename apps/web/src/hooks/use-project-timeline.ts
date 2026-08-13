import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api.js'

export interface TimelineEvent {
  id: string
  eventType: string
  eventSubtype?: string
  eventData: Record<string, unknown>
  sourceType: string
  sourceLabel?: string
  eventTime: string
  createdAt: string
}

export function useProjectTimeline(projectId?: string) {
  return useQuery({
    queryKey: ['project-timeline', projectId],
    queryFn: () =>
      get<TimelineEvent[]>(`/api/projects/${projectId}/timeline`),
    enabled: !!projectId,
  })
}
