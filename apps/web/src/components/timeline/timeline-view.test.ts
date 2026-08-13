import { describe, it, expect } from 'vitest'
import { categoryOf, filterEventsByCategory, presentCategories, shouldShowFilter, CATEGORY_LABELS } from './timeline-utils.js'
import type { ActivityEvent } from '../../hooks/use-activities.js'

function makeEvent(eventType: string): ActivityEvent {
  return {
    id: Math.random().toString(36).slice(2),
    tenantId: 't1',
    customerId: 'c1',
    eventType,
    eventData: {},
    sourceType: 'system',
    eventTime: '2026-08-09T10:00:00Z',
    createdAt: '2026-08-09T10:00:00Z',
  }
}

describe('categoryOf（事件类别推导）', () => {
  it('按前缀归类', () => {
    expect(categoryOf('COMPANY_CREATED')).toBe('customer')
    expect(categoryOf('CONTACT_CREATED')).toBe('contact')
    expect(categoryOf('PROJECT_CONTACT_CREATED')).toBe('contact')
    expect(categoryOf('LEAD_CONVERTED')).toBe('lead')
    expect(categoryOf('PROJECT_WAITING_MARKED')).toBe('project')
    expect(categoryOf('MILESTONE_ADVANCED')).toBe('project')
    expect(categoryOf('VISIT_CONFIRMED')).toBe('visit')
    expect(categoryOf('TASK_CREATED')).toBe('task')
    expect(categoryOf('AI_ANALYSIS_COMPLETED')).toBe('system')
    expect(categoryOf('SYSTEM_STALE_SCAN')).toBe('system')
  })

  it('未知类型归入 system', () => {
    expect(categoryOf('WHATEVER_NEW')).toBe('system')
  })
})

describe('filterEventsByCategory（类型筛选）', () => {
  const events = [
    makeEvent('VISIT_CONFIRMED'),
    makeEvent('PROJECT_WAITING_MARKED'),
    makeEvent('TASK_CREATED'),
  ]

  it('all 返回全部', () => {
    expect(filterEventsByCategory(events, 'all')).toHaveLength(3)
  })

  it('按类别过滤', () => {
    expect(filterEventsByCategory(events, 'visit')).toHaveLength(1)
    expect(filterEventsByCategory(events, 'project')).toHaveLength(1)
    expect(filterEventsByCategory(events, 'customer')).toHaveLength(0)
  })

  it('类别标签覆盖所有类别', () => {
    for (const c of ['all', 'customer', 'contact', 'lead', 'project', 'visit', 'task', 'system'] as const) {
      expect(CATEGORY_LABELS[c]).toBeTruthy()
    }
  })
})

describe('presentCategories / shouldShowFilter（筛选条按需出现）', () => {
  it('空列表只有全部', () => {
    expect(presentCategories([])).toEqual(['all'])
    expect(shouldShowFilter([])).toBe(false)
  })

  it('单一类别时不显示筛选条', () => {
    const events = [makeEvent('PROJECT_CREATED'), makeEvent('MILESTONE_ADVANCED')]
    expect(presentCategories(events)).toEqual(['all', 'project'])
    expect(shouldShowFilter(events)).toBe(false)
  })

  it('多个类别时显示，且只给出现过的类别（按标签顺序）', () => {
    const events = [makeEvent('TASK_CREATED'), makeEvent('VISIT_CONFIRMED'), makeEvent('PROJECT_CREATED')]
    expect(presentCategories(events)).toEqual(['all', 'project', 'visit', 'task'])
    expect(shouldShowFilter(events)).toBe(true)
  })
})
