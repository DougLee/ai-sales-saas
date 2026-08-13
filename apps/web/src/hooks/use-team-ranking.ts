import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api.js'

/**
 * 团队轻量排名（V6.1 §6.2）
 * WQMI = 平均质量分 × 0.6 + 闭环率 × 40；分数构成透明（行为/rubric 分列）
 */
export interface TeamRankingItem {
  userId: string
  name: string
  wqmi: number
  visitCount: number
  avgScore: number
  avgBehaviorScore: number
  avgRubricWeighted: number
  closureRate: number
  activeProjects: number
  staleProjects: number
  trend: number | null
}

export interface TeamRankingResponse {
  weekStart: string
  rankings: TeamRankingItem[]
  teamAvg: number
}

export function useTeamRanking(weekStart?: string) {
  const qs = weekStart ? `?weekStart=${weekStart}` : ''
  return useQuery({
    queryKey: ['team-ranking', weekStart || 'current'],
    queryFn: () => get<TeamRankingResponse>(`/api/dashboard/team-ranking${qs}`),
  })
}

/** 本周一 00:00（与服务端 getWeekStart 同口径） */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

export function toWeekStartParam(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
