import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del } from '../lib/api.js'
import { invalidateLeadRelated, invalidateProjectRelated, invalidateCompanyRelated } from '../lib/invalidation.js'
import { toast } from '../lib/toast.js'

export interface LeadHumanInfo {
  decisionMaker?: string
  decisionChain?: string
  supporter?: string
  opponent?: string
  /** 角色定位：关系切入者 / 重要影响力者 / 决策者（ADR-0002） */
  contactRole?: string
  /** 性格类型：老虎/孔雀/猫头鹰/考拉（选填） */
  personality?: string
}

export interface LeadBusinessInfo {
  requirements?: string
  timeline?: string
  painPoints?: string
  expectedOutcome?: string
  /** 竞品动向（选填，自由文本） */
  competitors?: string
}

export interface LeadFinanceInfo {
  budget?: string
  budgetSource?: string
  approvalProcess?: string
  /** 预算信号四档：none / mentioned / range / confirmed（ADR-0002 决策 4） */
  budgetSignal?: string
}

/** 列表推导字段（后端 leads.derivation.service 计算） */
export interface LeadDerivation {
  fourElements: { person: string; business: string; finance: string; decisionChain: string }
  gate: { passed: number; total: number; missing: string[]; softHints: string[] }
  currentStep: { step: number; label: string }
  aging: 'ok' | 'warning' | 'overdue'
}

export interface Lead {
  id: string
  name: string
  industry: string
  status: 'NEW' | 'FOLLOWING' | 'CONVERTED' | 'LOST' | 'PAUSED'
  source: string
  contactName?: string
  contactPhone?: string
  contactPosition?: string
  contactEmail?: string
  completenessScore: number
  confidenceScore?: number
  score?: number
  grade?: 'A' | 'B' | 'C'
  assessedAt?: string
  assessedBy?: string
  followUpCount: number
  lastFollowUpAt?: string
  lostReason?: string
  notes?: string
  convertedProjectId?: string
  companyId?: string
  company?: { id: string; name: string }
  humanInfo: LeadHumanInfo
  businessInfo: LeadBusinessInfo
  financeInfo: LeadFinanceInfo
  /** 列表接口附带的推导字段（四要素/门禁/7步/老化） */
  derivation?: LeadDerivation
  createdAt: string
  updatedAt: string
}

export interface LeadFollowUp {
  id: string
  content: string
  channel: 'phone' | 'wechat' | 'email' | 'visit' | 'other'
  outcome?: string
  nextAction?: string
  nextActionDeadline?: string
  createdAt: string
}

export interface LeadAssessmentJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  score?: number
  grade?: string
  error?: string
  result?: Record<string, unknown>
  createdAt: string
  completedAt?: string
}

export interface ScoreBreakdown {
  contactCompleteness: number
  needClarity: number
  budgetSignal: number
  decisionChainClarity: number
  bonus: number
  penalty: number
  total: number
  grade: 'A' | 'B' | 'C'
}

export function useLeads(params?: { status?: string; statusIn?: string; ready?: string; grade?: string; source?: string; search?: string; page?: number }) {
  const queryString = new URLSearchParams()
  if (params?.status) queryString.set('status', params.status)
  if (params?.statusIn) queryString.set('statusIn', params.statusIn)
  if (params?.ready) queryString.set('ready', params.ready)
  if (params?.grade) queryString.set('grade', params.grade)
  if (params?.source) queryString.set('source', params.source)
  if (params?.search) queryString.set('search', params.search)
  if (params?.page) queryString.set('page', String(params.page))

  return useQuery({
    queryKey: ['leads', params],
    queryFn: () =>
      get<{ items: Lead[]; total: number; page: number; pageSize: number }>(
        `/api/leads?${queryString.toString()}`
      ),
    refetchInterval: 30_000,
  })
}

export function useLead(id?: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => get<Lead>(`/api/leads/${id}`),
    enabled: !!id,
  })
}

/** 线索指标条（L1 专属）：跟进中/A 级/可转化/老化/转化率②（ADR-0002） */
export function useLeadMetrics() {
  return useQuery({
    queryKey: ['lead-metrics'],
    queryFn: () =>
      get<{
        following: number
        weeklyNew: number
        gradeA: number
        convertible: number
        aging: number
        conversionRate2: number
        counts: { following: number; convertible: number; nurturing: number; converted: number; lost: number }
      }>('/api/leads/metrics'),
  })
}

export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Lead>) => post<Lead>('/api/leads', data),
    onSuccess: () => {
      invalidateLeadRelated(qc)
      toast.success('线索创建成功')
    },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Lead> }) =>
      put<Lead>(`/api/leads/${id}`, data),
    onSuccess: (_res, vars) => {
      invalidateLeadRelated(qc, vars.id)
      toast.success('线索更新成功')
    },
    onError: (err) => toast.error((err as Error).message || '更新失败'),
  })
}

export function useDeleteLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del(`/api/leads/${id}`),
    onSuccess: () => {
      invalidateLeadRelated(qc)
      toast.success('线索已删除')
    },
    onError: (err) => toast.error((err as Error).message || '删除失败'),
  })
}

export function useConvertLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, force, forceReason }: { id: string; force?: boolean; forceReason?: string }) =>
      post<{ lead: Lead; project: { id: string; name: string } }>(`/api/leads/${id}/convert`, { force, forceReason }),
    onSuccess: (_res, vars) => {
      invalidateLeadRelated(qc, vars.id)
      // 转化会创建客户与商机
      invalidateProjectRelated(qc)
      invalidateCompanyRelated(qc)
      toast.success('线索转化成功')
    },
    onError: (err) => toast.error((err as Error).message || '转化失败'),
  })
}

export function useLeadFollowUp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { content: string; channel: string; outcome?: string; nextAction?: string; nextActionDeadline?: string } }) =>
      post<LeadFollowUp>(`/api/leads/${id}/follow-up`, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead-follow-ups', id] })
      qc.invalidateQueries({ queryKey: ['lead', id] })
      toast.success('跟进记录已保存')
    },
    onError: (err) => toast.error((err as Error).message || '保存失败'),
  })
}

export function useLeadFollowUps(leadId?: string) {
  return useQuery({
    queryKey: ['lead-follow-ups', leadId],
    queryFn: () => get<LeadFollowUp[]>(`/api/leads/${leadId}/follow-ups`),
    enabled: !!leadId,
    refetchInterval: 30_000,
  })
}

export function useLeadScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => post<{ lead: Lead; breakdown: ScoreBreakdown }>(`/api/leads/${id}/score`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', id] })
      toast.success('评分已更新')
    },
    onError: (err) => toast.error((err as Error).message || '评分失败'),
  })
}

export function useLeadAssess() {
  return useMutation({
    mutationFn: (id: string) => post<{ jobId: string; status: string }>(`/api/leads/${id}/assess`),
    onSuccess: () => {
      toast.success('AI 评估已触发，请稍后刷新查看结果')
    },
    onError: (err) => toast.error((err as Error).message || '评估失败'),
  })
}

export function useAssessmentJob(leadId?: string, jobId?: string) {
  return useQuery({
    queryKey: ['lead-assessment-job', leadId, jobId],
    queryFn: () => get<{ data: LeadAssessmentJob }>(`/api/leads/${leadId}/assessment-jobs/${jobId}`).then(r => r.data),
    enabled: !!leadId && !!jobId,
    // 终态（completed/failed）停止轮询（审计 #14：避免失败后仍每 3s 打一次）
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'completed' || status === 'failed' ? false : 3_000
    },
  })
}

export function useLeadLose() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, lostReason }: { id: string; lostReason: string }) =>
      post<Lead>(`/api/leads/${id}/lose`, { lostReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      toast.success('线索已标记为流失')
    },
    onError: (err) => toast.error((err as Error).message || '操作失败'),
  })
}

export function useLeadTimeline(leadId?: string) {
  return useQuery({
    queryKey: ['lead-timeline', leadId],
    queryFn: () => get<Array<Record<string, unknown>>>(`/api/leads/${leadId}/timeline`),
    enabled: !!leadId,
    refetchInterval: 30_000,
  })
}
