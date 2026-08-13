import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del } from '../lib/api.js'
import { invalidateVisitRelated } from '../lib/invalidation.js'
import { toast } from '../lib/toast.js'

export interface Visit {
  id: string
  projectId: string
  project?: { name: string }
  companyId?: string
  company?: { id: string; name: string }
  visitTime: string
  visitType: 'online' | 'offline' | 'phone'
  sceneType?: string
  summary?: string
  audioUrl?: string
  audioTranscript?: string
  contactName?: string
  contactPosition?: string
  contactRole?: string
  nextAction?: string
  nextActionDeadline?: string
  aiAnalysis?: Record<string, unknown>
  workflowStage?: string
  createdAt: string
  updatedAt: string
}

export function useVisits(params?: { projectId?: string }) {
  const queryString = new URLSearchParams()
  if (params?.projectId) queryString.set('projectId', params.projectId)

  return useQuery({
    queryKey: ['visits', params],
    queryFn: () =>
      get<{ items: Visit[]; total: number; page: number; pageSize: number }>(
        `/api/visits?${queryString.toString()}`
      ),
    refetchInterval: 30_000,
  })
}

export function useVisit(id?: string) {
  return useQuery({
    queryKey: ['visit', id],
    queryFn: () => get<Visit>(`/api/visits/${id}`),
    enabled: !!id,
  })
}

export function useCreateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Visit>) => post<Visit>('/api/visits', data),
    onSuccess: (_res, vars) => {
      invalidateVisitRelated(qc, { projectId: vars.projectId })
      toast.success('拜访记录创建成功')
    },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })
}

export function useUpdateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Visit> }) =>
      put<Visit>(`/api/visits/${id}`, data),
    onSuccess: (_res, vars) => {
      invalidateVisitRelated(qc, { visitId: vars.id, projectId: vars.data.projectId })
      toast.success('拜访记录更新成功')
    },
    onError: (err) => toast.error((err as Error).message || '更新失败'),
  })
}

export function useDeleteVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del(`/api/visits/${id}`),
    onSuccess: () => {
      invalidateVisitRelated(qc)
      toast.success('拜访记录已删除')
    },
    onError: (err) => toast.error((err as Error).message || '删除失败'),
  })
}

export interface VisitPrep {
  objective: string
  mustGetInfo: string[]
  suggestedQuestions: string[]
  riskAlerts: string[]
  talkingPoints: string[]
  missingFields: string[]
  currentStage: string
  backgroundSummary?: string
  contactIntel?: string
}

export function useVisitPrep() {
  return useMutation({
    mutationFn: (projectId: string) => post<VisitPrep>('/api/visits/prep', { projectId }),
    onError: (err) => toast.error((err as Error).message || '获取拜访准备失败'),
  })
}
