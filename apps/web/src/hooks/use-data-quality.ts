import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api.js'

export interface DataQualitySummary {
  completeness: { high: number; medium: number; low: number; total: number; avgScore: number }
  duplicates: {
    groups: number
    companies: number
    items: Array<{ name: string; count: number; ids: string[] }>
  }
  staleCustomers: {
    count: number
    items: Array<{ id: string; name: string; lastVisitTime: string | null }>
  }
  overdueLeads: {
    count: number
    items: Array<{ id: string; name: string; companyName: string | null; lastFollowUpAt: string | null; createdAt: string }>
  }
  staleProjects: {
    count: number
    items: Array<{ id: string; name: string; companyName: string | null; staleSince: string | null; healthScore: number | null }>
  }
}

export function useDataQuality() {
  return useQuery({
    queryKey: ['data-quality', 'summary'],
    queryFn: () => get<DataQualitySummary>('/api/data-quality/summary'),
    refetchInterval: 60_000,
  })
}
