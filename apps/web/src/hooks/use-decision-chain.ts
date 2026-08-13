import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, put } from '../lib/api.js'
import { toast } from '../lib/toast.js'

export interface DecisionNode {
  id: string
  contactId?: string
  name: string
  role: string
  attitude: string
  influence?: number
  weight?: number
  title?: string
  department?: string
  contactInfo?: {
    phone?: string
    email?: string
  }
  insights?: string[]
}

export interface DecisionRelation {
  sourceId: string
  targetId: string
  relation: string
}

export interface DecisionMap {
  nodes: DecisionNode[]
  relations: DecisionRelation[]
}

export interface DecisionChainSummary {
  nodeCount: number
  decisionMakerCount: number
  coachCount: number
  evaluatorCount: number
  supportiveCount: number
  opposedCount: number
  neutralCount: number
  coverageScore: number
}

export interface DecisionChainView {
  map: DecisionMap
  summary: DecisionChainSummary
}

export function useDecisionChain(projectId?: string) {
  return useQuery({
    queryKey: ['decision-chain', projectId],
    queryFn: () => get<DecisionChainView>(`/api/projects/${projectId}/decision-chain`),
    enabled: !!projectId,
  })
}

export function useUpdateDecisionChain(projectId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DecisionMap) => put<DecisionChainView>(`/api/projects/${projectId}/decision-chain`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decision-chain', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('决策链已更新')
    },
    onError: (err) => toast.error((err as Error).message || '更新失败'),
  })
}
