import type { Task } from '../../hooks/use-tasks.js'
import type { PillTone } from '../ui/status-pill.js'

/**
 * 任务来源分区（issue #41 B）：真实承诺（手动/AI）与系统噪音（巡检）视觉分离。
 *
 * source 值域来自后端（task.service 注释 / daily-scan / follow-up-reminders / leads.controller）：
 * - 表单创建不带 source → 手动
 * - visit_analysis / ai_visit_extraction（+ copilot 代建的 agent_crm_tool / ai_recommendation）→ AI 提取
 * - project_next_follow_up / visit_next_action / lead_follow_up → 跟进提醒
 * - daily_scan_*（巡检五类）/ stale_project_notify / company_unclaimed_release / agent_reminder 等 → 系统巡检
 */

export type TaskPartition = 'manual' | 'ai' | 'followUp' | 'system' | 'other'

export type TaskSourceFilter = 'all' | TaskPartition

const SOURCE_FILTER_KEYS: readonly TaskSourceFilter[] = ['all', 'manual', 'ai', 'followUp', 'system', 'other']

/** URL 参数 → 分区键的类型守卫（非法值回退 'all'） */
export function isTaskSourceFilter(v: string | null): v is TaskSourceFilter {
  return !!v && SOURCE_FILTER_KEYS.includes(v as TaskSourceFilter)
}

const AI_SOURCES = new Set([
  'visit_analysis',
  'ai_visit_extraction',
  'agent_crm_tool',
  'ai_recommendation',
])

const FOLLOW_UP_SOURCES = new Set(['project_next_follow_up', 'visit_next_action', 'lead_follow_up'])

const SYSTEM_SOURCES = new Set([
  'stale_project_notify',
  'company_unclaimed_release',
  'agent_reminder',
  'agent_gate_blocked',
  'sales_voice_audit',
])

export function partitionOfSource(source?: string | null): TaskPartition {
  if (!source) return 'manual'
  if (source === 'manual') return 'manual'
  if (AI_SOURCES.has(source)) return 'ai'
  if (FOLLOW_UP_SOURCES.has(source)) return 'followUp'
  if (SYSTEM_SOURCES.has(source) || source.startsWith('daily_scan_')) return 'system'
  return 'other'
}

export function matchSourcePartition(task: Task, filter: TaskSourceFilter): boolean {
  if (filter === 'all') return true
  return partitionOfSource(task.source) === filter
}

export interface SourcePartitionMeta {
  key: TaskPartition
  label: string
  /** 页签/分区的一句话定位（title 提示用） */
  hint: string
  tone: PillTone
}

/** 四级分区：真实承诺置顶，系统巡检降权殿后 */
export const SOURCE_PARTITIONS: readonly SourcePartitionMeta[] = [
  { key: 'manual', label: '手动创建', hint: '我手动创建的真实承诺', tone: 'level-manual' },
  { key: 'ai', label: 'AI 提取', hint: 'AI 从拜访/对话提取，复盘确认过的承诺', tone: 'info' },
  { key: 'followUp', label: '跟进提醒', hint: '商机/线索/拜访的节奏闹钟', tone: 'warning' },
  { key: 'system', label: '系统巡检', hint: '每日巡检的系统提醒，不是债', tone: 'neutral' },
]

export type SourcePartitionCounts = Record<TaskPartition, number>

export function sourcePartitionCounts(tasks: Task[]): SourcePartitionCounts {
  const counts: SourcePartitionCounts = { manual: 0, ai: 0, followUp: 0, system: 0, other: 0 }
  for (const t of tasks) counts[partitionOfSource(t.source)] += 1
  return counts
}
