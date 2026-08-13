import { describe, it, expect } from 'vitest'
import {
  ActivityEventType,
  getActivityMeta,
  renderActivityTitle,
} from '../../../src/lib/activity.js'

describe('ActivityEventType', () => {
  it('contains all required event types', () => {
    expect(ActivityEventType.COMPANY_CREATED).toBe('COMPANY_CREATED')
    expect(ActivityEventType.PROJECT_CREATED).toBe('PROJECT_CREATED')
    expect(ActivityEventType.VISIT_COMPLETED).toBe('VISIT_COMPLETED')
    expect(ActivityEventType.TASK_CREATED).toBe('TASK_CREATED')
    expect(ActivityEventType.LEAD_CONVERTED).toBe('LEAD_CONVERTED')
    expect(ActivityEventType.MILESTONE_ADVANCED).toBe('MILESTONE_ADVANCED')
    expect(ActivityEventType.PROJECT_STALE_MARKED).toBe('PROJECT_STALE_MARKED')
  })
})

describe('getActivityMeta', () => {
  it('returns meta for known event types', () => {
    const meta = getActivityMeta(ActivityEventType.PROJECT_CREATED)
    expect(meta.category).toBe('project')
    expect(meta.isAction).toBe(true)
    expect(meta.titleTemplate).toContain('创建商机')
  })

  it('returns fallback meta for unknown event types', () => {
    const meta = getActivityMeta('UNKNOWN_EVENT' as ActivityEventType)
    expect(meta.category).toBe('system')
    expect(meta.isAction).toBe(false)
    expect(meta.titleTemplate).toContain('{{eventType}}')
  })
})

describe('renderActivityTitle', () => {
  it('renders title with placeholders', () => {
    const title = renderActivityTitle(ActivityEventType.MILESTONE_ADVANCED, {
      from: 'M1',
      to: 'M2',
    })
    expect(title).toBe('里程碑推进：M1 → M2')
  })

  it('renders empty string for missing keys', () => {
    const title = renderActivityTitle(ActivityEventType.HEALTH_SCORE_CHANGED, {})
    expect(title).toBe('健康度更新为 ')
  })
})
