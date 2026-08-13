import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api.js'
import type { Task } from './use-tasks.js'
import type { Project } from './use-projects.js'
import type { Lead } from './use-leads.js'

export interface DashboardStats {
  newLeadsThisWeek: number
  activeProjects: number
  pendingVisits: number
  staleProjects: number
  avgHealthScore: number
  milestoneDistribution: Array<{
    name: string
    label: string
    count: number
  }>
  urgentProjects: Array<{
    id: string
    name: string
    urgency: string
    healthScore: number | null
    milestone: number
    company?: { name: string }
  }>
}

export interface DashboardMeResponse {
  todayTasks: {
    overdue: Task[]
    dueToday: Task[]
    highPriority: Task[]
    pending: Task[]
  }
  stuckProjects: {
    gateBlocked: Project[]
    stale: Project[]
    lowHealth: Project[]
    urgent: Project[]
  }
  followUpLeads: {
    active: Lead[]
    longOverdue: Lead[]
  }
  counts: {
    totalTasks: number
    overdueTasks: number
    stuckProjects: number
    followUpLeads: number
    pendingVisits: number
  }
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => get<DashboardStats>('/api/dashboard/stats'),
    refetchInterval: 30_000,
  })
}

export function useDashboardMe() {
  return useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: () => get<DashboardMeResponse>('/api/dashboard/me'),
    refetchInterval: 30_000,
    // 显式禁用 staleTime，确保删除实体后 dashboard 数据立即失效、立即重拉。
    // 修复"删完数据后页面还显示任务"的最后一环——前端缓存陈旧。
    staleTime: 0,
    refetchOnMount: true,
  })
}
