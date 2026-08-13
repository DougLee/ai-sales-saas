import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post } from '../lib/api.js'
import { toast } from '../lib/toast.js'

const API_BASE = import.meta.env.VITE_API_URL || ''

export interface KbFile {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  category?: string
  title?: string
  scope: string
  status: string
  createdAt: string
}

export interface FileAnalysis {
  fileName: string
  analysis: {
    summary?: string
    entities?: Array<{
      name: string
      type: string
      region?: string
      level?: string
      industry?: string
      contacts?: Array<{
        name: string
        position?: string
        phone?: string
        email?: string
        company?: string
        department?: string
      }>
    }>
    enrollPreview?: {
      accounts?: Array<Record<string, unknown>>
      leads?: Array<Record<string, unknown>>
      projects?: Array<Record<string, unknown>>
      contacts?: Array<Record<string, unknown>>
    }
  }
}

export function useKbFiles(scope = 'ALL') {
  return useQuery({
    queryKey: ['kb-files', scope],
    queryFn: () => get<{ results: KbFile[]; total: number }>(`/api/knowledge-base/files?scope=${scope}`),
  })
}

export function useUploadFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const token = localStorage.getItem('token') || ''
      const res = await fetch(`${API_BASE}/api/knowledge-base/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || '上传失败')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-files'] })
      toast.success('文件上传成功')
    },
    onError: (err) => toast.error((err as Error).message || '上传失败'),
  })
}

export function useAnalyzeFile() {
  return useMutation({
    mutationFn: (id: string) =>
      post<FileAnalysis>(`/api/knowledge-base/files/${id}/analyze`, {}),
    onError: (err) => toast.error((err as Error).message || '分析失败'),
  })
}

export function useEnrollBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      accounts?: unknown[]
      leads?: unknown[]
      projects?: unknown[]
      contacts?: unknown[]
    }) => post<{ success: boolean; result: Record<string, unknown[]>; summary: Record<string, number> }>('/api/agent/enroll-bulk', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      toast.success('导入成功')
    },
    onError: (err) => toast.error((err as Error).message || '导入失败'),
  })
}

export interface SearchResult {
  documentId: string
  content: string
  similarity: number
  fileName: string
}

export function useKbSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      const res = await get<{ results: SearchResult[]; total: number }>(`/api/knowledge-base/search?q=${encodeURIComponent(q.trim())}&topK=5`)
      setResults(res.results || [])
    } catch (err) {
      toast.error((err as Error).message || '搜索失败')
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  return { query, setQuery, results, searching, search }
}
