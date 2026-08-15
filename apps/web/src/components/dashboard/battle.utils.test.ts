import { describe, it, expect } from 'vitest'
import {
  buildBattleUnits,
  isTaskOverdue,
  companyOfTask,
  matchPriorityAction,
  buildJudgementSegments,
  groupPendingByCompany,
  pendingKeysOfUnit,
} from './battle.utils.js'
import type { Task } from '../../hooks/use-tasks.js'
import type { PriorityAction } from '@ai-sales/shared'
import type { PendingItem } from '../../hooks/use-confirmations.js'

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: '跟进任务',
    priority: 'MEDIUM',
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function yesterday(): string {
  return new Date(Date.now() - 86400000).toISOString()
}

describe('buildBattleUnits（三大战役聚合）', () => {
  it('按客户聚合任务并按紧迫分降序：逾期客户排最前', () => {
    const units = buildBattleUnits({
      overdue: [makeTask({ title: '逾期A', company: { id: 'c1', name: '客户A' } })],
      dueToday: [
        makeTask({ title: '今日B1', company: { id: 'c2', name: '客户B' } }),
        makeTask({ title: '今日B2', company: { id: 'c2', name: '客户B' }, priority: 'URGENT' }),
      ],
      highPriority: [makeTask({ title: '高优C', company: { id: 'c3', name: '客户C' } })],
    })
    expect(units).toHaveLength(3)
    expect(units[0].companyName).toBe('客户A')
    expect(units[0].overdueCount).toBe(1)
    expect(units[1].companyName).toBe('客户B')
    expect(units[1].dueTodayCount).toBe(2)
    expect(units[2].companyName).toBe('客户C')
  })

  it('task.company 缺失时回退 project.company，再回退项目名', () => {
    const units = buildBattleUnits({
      overdue: [
        makeTask({ project: { id: 'p1', name: '项目X', company: { id: 'c9', name: '客户X' } } }),
        makeTask({ project: { id: 'p2', name: '项目Y', company: null } }),
        makeTask({}),
      ],
      dueToday: [],
      highPriority: [],
    })
    const names = units.map((u) => u.companyName)
    expect(names).toContain('客户X')
    expect(names).toContain('项目Y')
    expect(names).toContain('未关联客户')
  })

  it('同一任务出现在多个桶时只计一次', () => {
    const shared = makeTask({ id: 't1', company: { id: 'c1', name: '客户A' } })
    const units = buildBattleUnits({
      overdue: [shared],
      dueToday: [shared],
      highPriority: [shared],
    })
    expect(units).toHaveLength(1)
    expect(units[0].tasks).toHaveLength(1)
  })

  it('空输入返回空数组', () => {
    expect(buildBattleUnits({ overdue: [], dueToday: [], highPriority: [] })).toEqual([])
  })
})

describe('isTaskOverdue', () => {
  it('截止日期在今天之前算逾期，今天/未来/无截止不算', () => {
    const today = new Date()
    expect(isTaskOverdue(makeTask({ deadline: yesterday() }))).toBe(true)
    expect(isTaskOverdue(makeTask({ deadline: today.toISOString() }))).toBe(false)
    expect(isTaskOverdue(makeTask({ deadline: undefined }))).toBe(false)
  })
})

describe('companyOfTask', () => {
  it('task.company 优先于 project.company', () => {
    const r = companyOfTask(
      makeTask({
        company: { id: 'c1', name: '直属客户' },
        project: { id: 'p1', name: '项目', company: { id: 'c2', name: '项目客户' } },
      }),
    )
    expect(r).toEqual({ id: 'c1', name: '直属客户' })
  })
})

describe('matchPriorityAction（战役卡挂 briefing 优先动作）', () => {
  const action = (entityName: string): PriorityAction => ({
    id: 'a1',
    rank: 1,
    title: '优先动作',
    entityType: 'project',
    entityId: 'e1',
    entityName,
    reason: '原因',
    suggestedAction: '建议',
    path: '/projects?id=e1',
    canExecute: false,
  })

  it('战役内任务的项目名能对上优先动作', () => {
    const unit = buildBattleUnits({
      overdue: [makeTask({ project: { id: 'p1', name: '智慧园区项目' } })],
      dueToday: [],
      highPriority: [],
    })[0]
    expect(matchPriorityAction(unit, [action('别的')])).toBeUndefined()
    expect(matchPriorityAction(unit, [action('智慧园区项目')])?.entityName).toBe('智慧园区项目')
  })
})

describe('buildJudgementSegments（指挥台战场判断）', () => {
  it('只保留非零片段，逾期最前', () => {
    const segs = buildJudgementSegments({
      overdueTasks: 2,
      pendingConfirmations: 0,
      staleProjects: 1,
      activeLeads: 5,
    })
    expect(segs.map((s) => s.label)).toEqual(['逾期任务', '停滞商机', '活跃线索待跟进'])
  })

  it('全零返回空数组（调用方渲染平稳文案）', () => {
    expect(
      buildJudgementSegments({ overdueTasks: 0, pendingConfirmations: 0, staleProjects: 0, activeLeads: 0 }),
    ).toEqual([])
  })
})

describe('groupPendingByCompany（战役卡与收件箱联动）', () => {
  const item = (companyId: string | null, companyName: string | null): PendingItem =>
    ({
      id: Math.random().toString(36).slice(2),
      itemType: 'budget_signal',
      itemData: { content: '预算 50 万' },
      status: 'pending',
      createdAt: new Date().toISOString(),
      context: { companyId, companyName },
    }) as unknown as PendingItem

  it('按 companyId 聚合，无 id 时退化为客户名', () => {
    const map = groupPendingByCompany([
      item('c1', '客户A'),
      item('c1', '客户A'),
      item(null, '客户B'),
      item(null, null),
    ])
    expect(map.get('id:c1')).toHaveLength(2)
    expect(map.get('name:客户B')).toHaveLength(1)
    expect(map.size).toBe(2)
  })

  it('pendingKeysOfUnit 与聚合键口径一致', () => {
    const unit = buildBattleUnits({
      overdue: [makeTask({ company: { id: 'c1', name: '客户A' } })],
      dueToday: [],
      highPriority: [],
    })[0]
    const map = groupPendingByCompany([item('c1', '客户A')])
    const keys = pendingKeysOfUnit(unit)
    expect(keys.some((k) => map.has(k))).toBe(true)
  })
})
