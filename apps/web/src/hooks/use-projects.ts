import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del } from '../lib/api.js'
import { toast } from '../lib/toast.js'

/**
 * 等待客户六类（V6.1 §7.2）：标记后 daily-scan 跳过停滞检测（倒计时暂停）
 */
export const WAITING_STATUSES = {
  awaiting_tender: '等招标公告发布',
  awaiting_semester: '等开学/学期开始',
  awaiting_budget: '等预算批复/立项',
  awaiting_funding: '等财政拨款到位',
  awaiting_approval: '等审批流程',
  awaiting_meeting: '等会议流程',
} as const

export type WaitingStatus = keyof typeof WAITING_STATUSES

export function useMarkWaiting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, waitingStatus, note }: { id: string; waitingStatus: WaitingStatus; note?: string }) =>
      put<Project>(`/api/projects/${id}/waiting`, { waitingStatus, note }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', vars.id] })
      qc.invalidateQueries({ queryKey: ['activities'] })
      toast.success('已标记等待客户，停滞倒计时暂停')
    },
    onError: (err) => toast.error((err as Error).message || '标记失败'),
  })
}

export function useClearWaiting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del(`/api/projects/${id}/waiting`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', id] })
      qc.invalidateQueries({ queryKey: ['activities'] })
      toast.success('已解除等待，恢复停滞检测')
    },
    onError: (err) => toast.error((err as Error).message || '解除失败'),
  })
}

export interface Project {
  id: string
  name: string
  industry: string
  amount?: number
  milestone: number
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  healthScore?: number
  nextFollowUp?: string
  lastVisitTime?: string
  notes?: string
  isStale?: boolean
  staleSince?: string
  waitingStatus?: WaitingStatus | null
  waitingSince?: string | null
  waitingNote?: string | null
  closedAt?: string
  lostInfo?: Record<string, unknown>
  humanInfo?: Record<string, unknown>
  businessInfo?: Record<string, unknown>
  financeInfo?: Record<string, unknown>
  decisionMap?: Record<string, unknown>
  company?: { id: string; name: string }
  contacts?: Array<{
    role: string
    attitude: string
    contact: {
      id: string
      name: string
      position?: string
      phone?: string
      email?: string
      decisionRole?: string
    }
  }>
  visits?: Array<{
    id: string
    visitTime: string
    visitType: string
    summary?: string
    contactName?: string
  }>
  tasks?: Array<{
    id: string
    title: string
    status: string
    priority: string
    deadline?: string
  }>
  createdAt: string
  updatedAt: string
}

export function useProjects(params?: { milestone?: number; urgency?: string; search?: string }) {
  const queryString = new URLSearchParams()
  if (params?.milestone != null) queryString.set('milestone', String(params.milestone))
  if (params?.urgency) queryString.set('urgency', params.urgency)
  if (params?.search) queryString.set('search', params.search)

  return useQuery({
    queryKey: ['projects', params],
    queryFn: () =>
      get<{ items: Project[]; total: number; page: number; pageSize: number }>(
        `/api/projects?${queryString.toString()}`
      ),
    refetchInterval: 30_000,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Project>) => post<Project>('/api/projects', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success('商机创建成功')
    },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) =>
      put<Project>(`/api/projects/${id}`, data),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      // P0：详情页走 ['project', id] 独立查询，操作后必须精确失效，否则详情不刷新
      qc.invalidateQueries({ queryKey: ['project', vars.id] })
      toast.success('商机更新成功')
    },
    onError: (err) => toast.error((err as Error).message || '更新失败'),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del(`/api/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success('商机已删除')
    },
    onError: (err) => toast.error((err as Error).message || '删除失败'),
  })
}

export function useProject(id?: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => get<Project>(`/api/projects/${id}`),
    enabled: !!id,
  })
}

export interface PipelineColumn {
  milestone: number
  name: string
  items: Project[]
}

export interface PipelineData {
  columns: PipelineColumn[]
  total: number
}

export function usePipeline() {
  return useQuery({
    queryKey: ['projects', 'pipeline'],
    queryFn: () => get<PipelineData>('/api/projects/pipeline'),
    refetchInterval: 30_000,
  })
}
