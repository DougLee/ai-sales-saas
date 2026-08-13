import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post } from '../lib/api.js'
import { toast } from '../lib/toast.js'

export interface MilestoneStage {
  stage: number
  name: string
  criteria: string[]
  evidenceRequired: string[]
}

export interface MethodologyConfig {
  id: string
  moduleType: string
  version: string
  configJson: {
    stages?: MilestoneStage[]
    situation?: { prompt: string; examples: string[] }
    problem?: { prompt: string; examples: string[] }
    implication?: { prompt: string; examples: string[] }
    needPayoff?: { prompt: string; examples: string[] }
    dimensions?: { role: string; trustIndicators: string[]; attitudeTracking: boolean }[]
    extractionRules?: string[]
  }
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export function useMethodologyConfigs() {
  return useQuery({
    queryKey: ['methodology-configs'],
    queryFn: () => get<MethodologyConfig[]>('/api/methodology-config'),
    refetchInterval: 60_000,
  })
}

export function useMethodologyDetail(moduleType: string) {
  return useQuery({
    queryKey: ['methodology-config', moduleType],
    queryFn: () =>
      get<MethodologyConfig>(`/api/methodology-config/detail?moduleType=${encodeURIComponent(moduleType)}`),
    enabled: !!moduleType,
  })
}

export function useCreateMethodologyConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<MethodologyConfig>) =>
      post<MethodologyConfig>('/api/methodology-config', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['methodology-configs'] })
      toast.success('配置保存成功')
    },
    onError: (err) => toast.error((err as Error).message || '保存失败'),
  })
}
