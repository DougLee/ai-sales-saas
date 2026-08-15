import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del } from '../lib/api.js'
import { toast } from '../lib/toast.js'
import { useDetailDrawerActive, useListPollingPaused } from './use-detail-drawer.js'

export interface Company {
  id: string
  name: string
  industry?: string
  scale?: string
  region?: string
  level?: string
  address?: string
  website?: string
  contactPerson?: string
  contactPhone?: string
  notes?: string
  status?: string
  source?: string
  completenessScore?: number
  dataConfidence?: string
  ownerId?: string | null
  owner?: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
  _count?: { projects: number; leads: number; visits: number; tasks: number }
}

export interface CompanyDetail {
  company: Company
  projects: Array<{
    id: string
    name: string
    milestone: number
    urgency: string
    healthScore: number | null
    amount: number | null
    closedAt: string | null
    updatedAt: string
  }>
  contacts: Array<{
    id: string
    name: string
    position?: string
    department?: string
    phone?: string
    email?: string
    decisionRole?: string
    updatedAt: string
  }>
  visits: Array<{
    id: string
    visitTime: string
    visitType: string
    summary?: string
    contactName?: string
    project: { name: string }
  }>
  tasks: Array<{
    id: string
    title: string
    status: string
    priority: string
    deadline?: string
    project: { name: string }
  }>
  stats: {
    projectCount: number
    activeProjectCount: number
    contactCount: number
    decisionMakerCount: number
    visitCount: number
    pendingTaskCount: number
    overdueTaskCount: number
    lastContactAt: string | null
    daysSinceLastContact: number | null
    avgHealthScore: number | null
  }
  risks: Array<{ type: string; message: string; severity: 'HIGH' | 'MEDIUM' | 'LOW' }>
  completeness: {
    score: number
    missingFields: string[]
  }
  _readonly?: boolean
}

export interface CompanyListParams {
  search?: string
  pool?: string
  status?: string
  industry?: string
  level?: string
  region?: string
  source?: string
  ownerId?: string
  page?: number
  pageSize?: number
}

export function useCompanies(params?: CompanyListParams) {
  // #20 轮询互斥：详情 drawer 打开时暂停列表轮询
  const pollingPaused = useListPollingPaused()
  const queryString = new URLSearchParams()
  if (params?.search) queryString.set('search', params.search)
  if (params?.pool) queryString.set('pool', params.pool)
  if (params?.status) queryString.set('status', params.status)
  if (params?.industry) queryString.set('industry', params.industry)
  if (params?.level) queryString.set('level', params.level)
  if (params?.region) queryString.set('region', params.region)
  if (params?.source) queryString.set('source', params.source)
  if (params?.ownerId) queryString.set('ownerId', params.ownerId)
  if (params?.page) queryString.set('page', String(params.page))
  if (params?.pageSize) queryString.set('pageSize', String(params.pageSize))

  return useQuery({
    queryKey: ['companies', params],
    queryFn: () =>
      get<{ items: Company[]; total?: number; counts?: Record<string, number>; page?: number; pageSize?: number }>(
        `/api/companies?${queryString.toString()}`
      ),
    refetchInterval: pollingPaused ? false : 30_000,
  })
}

/** 客户池指标条（L0 专属）：总量周新增 / 已触达率 / 转化率① / 待核实 */
export function useCompanyMetrics() {
  return useQuery({
    queryKey: ['company-metrics'],
    queryFn: () =>
      get<{
        total: number
        weeklyNew: number
        reached: number
        reachedRate: number
        producedLeads: number
        conversionRate1: number
        pendingVerify: number
      }>('/api/companies/metrics'),
    // #20：失效矩阵已保证 mutation 后精确失效，轮询窗口内的 refocus 重拉没必要
    staleTime: 30_000,
  })
}

/** 批量操作：认领 / 分配负责人（ADR-0001 决策 2） */
export function useBatchCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { action: 'claim' | 'assign'; ids: string[]; ownerId?: string }) =>
      post<{ updated: number; skipped: number }>('/api/companies/batch', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['company-metrics'] })
      qc.invalidateQueries({ queryKey: ['company'] })
      toast.success(`批量操作完成：更新 ${res?.updated ?? 0} 家${res?.skipped ? `，跳过 ${res.skipped} 家` : ''}`)
    },
    onError: (err) => toast.error((err as Error).message || '批量操作失败'),
  })
}

/** 可分配成员列表（批量分配负责人下拉用；仅 TENANT_ADMIN/SUPER_ADMIN/DEPT_HEAD 可调） */
export function useAssignableUsers(enabled?: boolean) {
  return useQuery({
    queryKey: ['assignable-users'],
    queryFn: () => get<{ items: Array<{ id: string; name: string }> }>('/api/org/users/assignable'),
    enabled: !!enabled,
    staleTime: 5 * 60_000,
  })
}

export function useCompany(id?: string) {
  // #20：详情激活期间登记，供列表 hook 暂停轮询
  useDetailDrawerActive(!!id)
  return useQuery({
    queryKey: ['company', id],
    queryFn: () => get<CompanyDetail>(`/api/companies/${id}`),
    enabled: !!id,
  })
}

export function useCreateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Company>) =>
      post<{ item: Company }>('/api/companies', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['company-metrics'] })
      toast.success('客户创建成功')
    },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })
}

export function useUpdateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Company> }) =>
      put<{ item: Company }>(`/api/companies/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['company-metrics'] })
      qc.invalidateQueries({ queryKey: ['company'] })
      toast.success('客户更新成功')
    },
    onError: (err) => toast.error((err as Error).message || '更新失败'),
  })
}

export function useDeleteCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del(`/api/companies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['company-metrics'] })
      toast.success('客户已删除')
    },
    onError: (err) => toast.error((err as Error).message || '删除失败'),
  })
}

export function useClaimCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      post<{ item: Company }>(`/api/companies/${id}/claim`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['company-metrics'] })
      qc.invalidateQueries({ queryKey: ['company'] })
      toast.success('认领成功')
    },
    onError: (err) => toast.error((err as Error).message || '认领失败'),
  })
}

export function useAssignCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ownerId }: { id: string; ownerId: string | null }) =>
      post<{ item: Company }>(`/api/companies/${id}/assign`, { ownerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['company-metrics'] })
      qc.invalidateQueries({ queryKey: ['company'] })
      toast.success('分配成功')
    },
    onError: (err) => toast.error((err as Error).message || '分配失败'),
  })
}

export function useUpdateCompanyStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      put<{ item: Company }>(`/api/companies/${id}/status`, { status, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['company-metrics'] })
      qc.invalidateQueries({ queryKey: ['company'] })
      toast.success('状态更新成功')
    },
    onError: (err) => toast.error((err as Error).message || '状态更新失败'),
  })
}

export function useCompanyMissingFields(id?: string) {
  return useQuery({
    queryKey: ['company-missing-fields', id],
    queryFn: () => get<Array<{ field: string; label: string; severity: 'high' | 'medium' }>>(`/api/companies/${id}/missing-fields`),
    enabled: !!id,
  })
}

export function useCompanyChangeHistory(id?: string) {
  return useQuery({
    queryKey: ['company-history', id],
    queryFn: () => get<Array<{ id: string; fieldName: string; oldValue?: string; newValue?: string; createdAt: string; changeSource: string }>>(`/api/companies/${id}/history`),
    enabled: !!id,
  })
}

export function useCompanyDuplicates(name?: string, excludeId?: string) {
  const queryString = new URLSearchParams()
  if (name) queryString.set('name', name)
  if (excludeId) queryString.set('excludeId', excludeId)
  return useQuery({
    queryKey: ['company-duplicates', name, excludeId],
    queryFn: () => get<Array<{ id: string; name: string; similarity: number; reason: string }>>(`/api/companies/duplicates?${queryString.toString()}`),
    enabled: !!name,
  })
}

export interface MergeResult {
  intoId: string
  fromId: string
  migrated: { leads: number; projects: number; contacts: number; visits: number; tasks: number; timeline: number; snapshots: number }
  filledFields: string[]
}

/** 客户合并：把 fromId 客户合并进主客户 intoId */
export function useMergeCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ intoId, fromId }: { intoId: string; fromId: string }) =>
      post<MergeResult>(`/api/companies/${intoId}/merge`, { fromId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['company-metrics'] })
      qc.invalidateQueries({ queryKey: ['company'] })
      qc.invalidateQueries({ queryKey: ['company-duplicates'] })
      qc.invalidateQueries({ queryKey: ['data-quality'] })
      const m = res?.migrated
      const total = m ? m.leads + m.projects + m.contacts + m.visits + m.tasks : 0
      toast.success(`合并完成，已迁移 ${total} 条关联记录`)
    },
    onError: (err) => toast.error((err as Error).message || '合并失败'),
  })
}
