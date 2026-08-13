import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api.js'
import type { Briefing } from '@ai-sales/shared'

export function useBriefing() {
  return useQuery({
    queryKey: ['briefing'],
    queryFn: () => get<Briefing>('/api/dashboard/briefing'),
    refetchInterval: 5 * 60 * 1000, // 5 分钟刷新
    // 简报涉及优先动作，删除实体后必须立即失效以保证列表不再展示幽灵动作
    staleTime: 0,
    refetchOnMount: true,
  })
}
