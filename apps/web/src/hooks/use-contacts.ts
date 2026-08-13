import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del } from '../lib/api.js'
import { invalidateContactRelated } from '../lib/invalidation.js'
import { toast } from '../lib/toast.js'

export interface CompanyRef {
  id: string
  name: string
}

export interface Contact {
  id: string
  name: string
  position?: string
  department?: string
  companyId?: string
  company?: CompanyRef
  phone?: string
  email?: string
  wechat?: string
  decisionRole?: 'COACH' | 'EVALUATOR' | 'DECISION_MAKER' | null
  roleConfidence?: string
  personalMotive?: string
  roiConcern?: string
  riskConcern?: string
  pressurePoints?: string
  howToReach?: string
  howToPersuade?: string
  aiTagged?: boolean
  createdAt: string
  updatedAt: string
}

export function useContacts(params?: { search?: string; company?: string }) {
  const queryString = new URLSearchParams()
  if (params?.search) queryString.set('search', params.search)
  if (params?.company) queryString.set('company', params.company)
  const qs = queryString.toString()

  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () =>
      get<{ items: Contact[] }>(`/api/contacts${qs ? `?${qs}` : ''}`),
    refetchInterval: 30_000,
  })
}

export function useContact(id?: string) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => get<Contact>(`/api/contacts/${id}`),
    enabled: !!id,
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) =>
      post<{ item: Contact }>('/api/contacts', data),
    onSuccess: () => {
      invalidateContactRelated(queryClient)
      toast('联系人创建成功', 'success')
    },
    onError: (err: Error) => {
      toast(err.message || '创建失败', 'error')
    },
  })
}

export function useUpdateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) =>
      put<{ item: Contact }>(`/api/contacts/${id}`, data),
    onSuccess: (_res, vars) => {
      invalidateContactRelated(queryClient, vars.id)
      toast('联系人更新成功', 'success')
    },
    onError: (err: Error) => {
      toast(err.message || '更新失败', 'error')
    },
  })
}

export function useDeleteContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      del(`/api/contacts/${id}`),
    onSuccess: () => {
      invalidateContactRelated(queryClient)
      toast('联系人删除成功', 'success')
    },
    onError: (err: Error) => {
      toast(err.message || '删除失败', 'error')
    },
  })
}
