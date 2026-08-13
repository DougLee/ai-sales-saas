import { describe, expect, it } from 'vitest'
import {
  deadlineInfo,
  focusTasks,
  groupTasks,
  groupTitle,
  isDueToday,
  isOverdue,
  overdueDays,
} from '../task-utils.js'
import type { Task } from '../../hooks/use-tasks.js'

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: '任务',
    status: 'PENDING',
    priority: 'MEDIUM',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Task
}

function dateOffset(days: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

describe('isOverdue / isDueToday', () => {
  it('昨天截止 = 逾期；今天截止 = 今天到期且不算逾期', () => {
    expect(isOverdue(makeTask({ deadline: dateOffset(-1) }))).toBe(true)
    const today = makeTask({ deadline: dateOffset(0) })
    expect(isOverdue(today)).toBe(false)
    expect(isDueToday(today)).toBe(true)
  })

  it('已完成/已取消的任务不算逾期也不算今日到期', () => {
    expect(isOverdue(makeTask({ deadline: dateOffset(-3), status: 'COMPLETED' }))).toBe(false)
    expect(isDueToday(makeTask({ deadline: dateOffset(0), status: 'CANCELLED' }))).toBe(false)
  })

  it('逾期天数按日粒度计算', () => {
    expect(overdueDays(makeTask({ deadline: dateOffset(-1) }))).toBe(1)
    expect(overdueDays(makeTask({ deadline: dateOffset(-5) }))).toBe(5)
  })
})

describe('deadlineInfo 期限分级', () => {
  it('逾期红 / 今天橙 / 明天和以后灰', () => {
    expect(deadlineInfo(makeTask({ deadline: dateOffset(-2) }))).toEqual({ text: '已逾期 2 天', tone: 'danger' })
    expect(deadlineInfo(makeTask({ deadline: dateOffset(0) }))).toEqual({ text: '今天截止', tone: 'warning' })
    expect(deadlineInfo(makeTask({ deadline: dateOffset(1) }))).toEqual({ text: '明天截止', tone: 'muted' })
    expect(deadlineInfo(makeTask({ deadline: dateOffset(7) }))!.tone).toBe('muted')
    expect(deadlineInfo(makeTask({}))).toBeNull()
  })
})

describe('groupTitle 组头去重', () => {
  it('项目名以客户名开头时去掉重复前缀', () => {
    expect(groupTitle('华北水利水电大学', '华北水利水电大学-人工智能通识课')).toBe('华北水利水电大学 · 人工智能通识课')
    expect(groupTitle('郑州财税金融职业学院', '郑州财税金融职业学院·通识课')).toBe('郑州财税金融职业学院 · 通识课')
  })
  it('项目名与客户名相同/无前缀/缺省时的兜底', () => {
    expect(groupTitle('某客户', '某客户')).toBe('某客户')
    expect(groupTitle('某客户', '全新项目')).toBe('某客户 · 全新项目')
    expect(groupTitle('某客户')).toBe('某客户')
    expect(groupTitle('', '仅项目名')).toBe('仅项目名')
    expect(groupTitle('')).toBe('未关联客户/商机')
  })
})

describe('groupTasks', () => {
  it('按客户·商机分组，组按最急截止日升序', () => {
    const tasks = [
      makeTask({ title: 'A1', deadline: dateOffset(10), project: { id: 'p1', name: '甲-项目', company: { id: 'c1', name: '甲' } } as never }),
      makeTask({ title: 'B1', deadline: dateOffset(1), project: { id: 'p2', name: '乙-项目', company: { id: 'c2', name: '乙' } } as never }),
      makeTask({ title: 'A2', deadline: dateOffset(5), project: { id: 'p1', name: '甲-项目', company: { id: 'c1', name: '甲' } } as never }),
    ]
    const groups = groupTasks(tasks)
    expect(groups.map((g) => g.title)).toEqual(['乙 · 项目', '甲 · 项目'])
    expect(groups[1].tasks.map((t) => t.title)).toEqual(['A2', 'A1'])
  })
})

describe('focusTasks 今日聚焦', () => {
  it('只保留逾期和今天到期的未完成任务，按截止升序', () => {
    const tasks = [
      makeTask({ title: '以后', deadline: dateOffset(9) }),
      makeTask({ title: '今天', deadline: dateOffset(0) }),
      makeTask({ title: '逾期', deadline: dateOffset(-2) }),
      makeTask({ title: '已完成逾期', deadline: dateOffset(-2), status: 'COMPLETED' }),
      makeTask({ title: '无期限' }),
    ]
    expect(focusTasks(tasks).map((t) => t.title)).toEqual(['逾期', '今天'])
  })
})
