import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del } from '../lib/api.js'
import { toast } from '../lib/toast.js'
import { useDetailDrawerActive, useListPollingPaused } from './use-detail-drawer.js'

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
      qc.invalidateQueries({ queryKey: ['project-metrics'] })
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
      qc.invalidateQueries({ queryKey: ['project-metrics'] })
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
  status?: 'following' | 'stale' | 'won' | 'lost'
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
  /** gate 字段来源映射（evidence._gateFieldSource，ADR-0004 阶段档案） */
  evidence?: Record<string, unknown>
  /** 列表推导字段（后端 projects.derivation.service，ADR-0003） */
  derivation?: ProjectDerivation
  sourceLeadId?: string
  /** 详情接口附加：健康度五维雷达（computeProjectHealthScore） */
  healthRadar?: Array<{ name?: string; label?: string; score?: number }>
}

export interface ProjectDerivation {
  staleDays: number
  waiting: boolean
  decisionChainCount: number
  evidenceCount: number
  nextAction: { title: string; deadline: string | null } | null
  illusion: boolean
  credibility: number
}

/** 商机指标条六格（L2 专属）：在途/名义/脱水+脱水率/停滞/等待/转化率③ */
export function useProjectMetrics() {
  return useQuery({
    queryKey: ['project-metrics'],
    queryFn: () =>
      get<{
        active: number
        nominalAmount: number
        dehydratedAmount: number
        dehydrationRate: number
        stale: number
        waitingCount: number
        conversionRate3: number
      }>('/api/projects/metrics'),
    // #20：失效矩阵已保证 mutation 后精确失效，轮询窗口内的 refocus 重拉没必要
    staleTime: 30_000,
  })
}

export function useProjects(params?: { milestone?: number; urgency?: string; search?: string; page?: number; pageSize?: number }) {
  // #20 轮询互斥：详情 drawer 打开时暂停列表轮询
  const pollingPaused = useListPollingPaused()
  const queryString = new URLSearchParams()
  if (params?.milestone != null) queryString.set('milestone', String(params.milestone))
  if (params?.urgency) queryString.set('urgency', params.urgency)
  if (params?.search) queryString.set('search', params.search)
  if (params?.page) queryString.set('page', String(params.page))
  if (params?.pageSize) queryString.set('pageSize', String(params.pageSize))

  return useQuery({
    queryKey: ['projects', params],
    queryFn: () =>
      get<{ items: Project[]; total: number; page: number; pageSize: number }>(
        `/api/projects?${queryString.toString()}`
      ),
    refetchInterval: pollingPaused ? false : 30_000,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Project>) => post<Project>('/api/projects', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project-metrics'] })
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
      qc.invalidateQueries({ queryKey: ['project-metrics'] })
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
      qc.invalidateQueries({ queryKey: ['project-metrics'] })
      toast.success('商机已删除')
    },
    onError: (err) => toast.error((err as Error).message || '删除失败'),
  })
}

/** 阶段档案：门禁字段人工录入 / manual-pass 豁免（ADR-0004 决策 5/6） */
export function useUpdateGateField(projectId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { path: string; value?: string; manualPass?: boolean; reason?: string; addSource?: string; revokeSource?: string; confirmDecision?: boolean }) =>
      put(`/api/projects/${projectId}/gate-field`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project-metrics'] })
      toast.success('阶段档案已更新')
    },
    onError: (err) => toast.error((err as Error).message || '更新失败'),
  })
}

export function useProject(id?: string) {
  // #20：详情激活期间登记，供列表 hook 暂停轮询
  useDetailDrawerActive(!!id)
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => get<Project>(`/api/projects/${id}`),
    enabled: !!id,
  })
}
