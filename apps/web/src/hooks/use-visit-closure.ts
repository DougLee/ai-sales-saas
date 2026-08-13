import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api.js'

/**
 * 拜访闭环记录（V6.1 §5.3 六节点 + §6.1 双轨评分）
 * qualityScore = 行为分(0-60) + rubric 折算分(0-40)
 */
export interface VisitClosure {
  id: string
  visitId: string
  projectId?: string | null
  ownerId: string
  hasPreparation: boolean
  hasRecording: boolean
  hasSummary: boolean
  hasAiAnalysis: boolean
  hasFollowUp: boolean
  hasConfirmation: boolean
  qualityScore: number | null
  qualityFactors?: {
    preparation?: number
    rawDocumentation?: number
    followUp?: number
    progression?: number
    rubricWeighted?: number
  } | null
  rubricScore?: number | null
  rubricDetails?: Record<string, unknown> | null
  spotChecked?: boolean
  spotCheckScore?: number | null
  closedAt?: string | null
  createdAt: string
  updatedAt: string
}

export function useVisitClosure(visitId?: string) {
  return useQuery({
    queryKey: ['visit-closure', visitId],
    queryFn: () => get<VisitClosure>(`/api/visits/${visitId}/closure`),
    enabled: !!visitId,
  })
}
