import { describe, expect, it } from 'vitest'
import {
  isTaskSourceFilter,
  matchSourcePartition,
  partitionOfSource,
  sourcePartitionCounts,
  SOURCE_PARTITIONS,
} from './task-partitions.utils.js'
import type { Task } from '../../hooks/use-tasks.js'

function makeTask(source?: string): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: '任务',
    status: 'PENDING',
    priority: 'MEDIUM',
    source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Task
}

describe('partitionOfSource（来源值域 → 四级分区）', () => {
  it('无 source / manual → 手动创建（表单创建不带 source）', () => {
    expect(partitionOfSource(undefined)).toBe('manual')
    expect(partitionOfSource(null)).toBe('manual')
    expect(partitionOfSource('manual')).toBe('manual')
  })

  it('拜访/对话提取与 copilot 代建 → AI 提取', () => {
    expect(partitionOfSource('visit_analysis')).toBe('ai')
    expect(partitionOfSource('ai_visit_extraction')).toBe('ai')
    expect(partitionOfSource('agent_crm_tool')).toBe('ai')
    expect(partitionOfSource('ai_recommendation')).toBe('ai')
  })

  it('商机/拜访/线索跟进 → 跟进提醒', () => {
    expect(partitionOfSource('project_next_follow_up')).toBe('followUp')
    expect(partitionOfSource('visit_next_action')).toBe('followUp')
    expect(partitionOfSource('lead_follow_up')).toBe('followUp')
  })

  it('巡检五类前缀与其余系统提醒 → 系统巡检', () => {
    expect(partitionOfSource('daily_scan_STALE_PROJECT')).toBe('system')
    expect(partitionOfSource('daily_scan_OVERDUE_LEAD')).toBe('system')
    expect(partitionOfSource('daily_scan_DUE_TASK')).toBe('system')
    expect(partitionOfSource('daily_scan_LOW_HEALTH')).toBe('system')
    expect(partitionOfSource('daily_scan_MISSING_VISIT')).toBe('system')
    expect(partitionOfSource('stale_project_notify')).toBe('system')
    expect(partitionOfSource('company_unclaimed_release')).toBe('system')
    expect(partitionOfSource('agent_reminder')).toBe('system')
  })

  it('未知来源兜底 other，不混入四级分区', () => {
    expect(partitionOfSource('future_unknown_source')).toBe('other')
  })
})

describe('matchSourcePartition / sourcePartitionCounts', () => {
  const tasks = [
    makeTask(), // manual
    makeTask('visit_analysis'), // ai
    makeTask('daily_scan_DUE_TASK'), // system
    makeTask('lead_follow_up'), // followUp
    makeTask('daily_scan_LOW_HEALTH'), // system
  ]

  it('all 全放行，分区各自命中', () => {
    expect(tasks.filter((t) => matchSourcePartition(t, 'all'))).toHaveLength(5)
    expect(tasks.filter((t) => matchSourcePartition(t, 'manual'))).toHaveLength(1)
    expect(tasks.filter((t) => matchSourcePartition(t, 'ai'))).toHaveLength(1)
    expect(tasks.filter((t) => matchSourcePartition(t, 'followUp'))).toHaveLength(1)
    expect(tasks.filter((t) => matchSourcePartition(t, 'system'))).toHaveLength(2)
    expect(tasks.filter((t) => matchSourcePartition(t, 'other'))).toHaveLength(0)
  })

  it('counts 按分区计数', () => {
    expect(sourcePartitionCounts(tasks)).toEqual({
      manual: 1,
      ai: 1,
      followUp: 1,
      system: 2,
      other: 0,
    })
  })
})

describe('SOURCE_PARTITIONS 分区定义', () => {
  it('四级分区齐全且 key 唯一（手动/AI/跟进/巡检，巡检殿后降权）', () => {
    expect(SOURCE_PARTITIONS.map((p) => p.key)).toEqual(['manual', 'ai', 'followUp', 'system'])
    expect(new Set(SOURCE_PARTITIONS.map((p) => p.label)).size).toBe(4)
  })
})

describe('isTaskSourceFilter（URL 参数守卫）', () => {
  it('合法分区键放行，非法值与空值拒绝', () => {
    expect(isTaskSourceFilter('all')).toBe(true)
    expect(isTaskSourceFilter('manual')).toBe(true)
    expect(isTaskSourceFilter('system')).toBe(true)
    expect(isTaskSourceFilter('other')).toBe(true)
    expect(isTaskSourceFilter('tab')).toBe(false)
    expect(isTaskSourceFilter(null)).toBe(false)
  })
})
