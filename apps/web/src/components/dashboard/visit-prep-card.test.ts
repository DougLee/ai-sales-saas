import { describe, it, expect } from 'vitest'
import { upcomingVisits } from './visit-prep.utils.js'
import type { Visit } from '../../hooks/use-visits.js'

function makeVisit(overrides: Partial<Visit>): Visit {
  return {
    id: Math.random().toString(36).slice(2),
    projectId: 'p1',
    visitTime: new Date().toISOString(),
    visitType: 'offline',
    workflowStage: 'DRAFT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('upcomingVisits（工作台拜访准备区）', () => {
  it('只取未来 7 天内且未关闭的拜访，按时间升序', () => {
    const in3d = new Date(Date.now() + 3 * 86400000).toISOString()
    const in6d = new Date(Date.now() + 6 * 86400000).toISOString()
    const in10d = new Date(Date.now() + 10 * 86400000).toISOString()
    const visits = [
      makeVisit({ visitTime: in6d }),
      makeVisit({ visitTime: in3d }),
      makeVisit({ visitTime: in10d }), // 超出窗口
      makeVisit({ visitTime: in3d, workflowStage: 'CLOSED' }), // 已关闭
    ]
    const result = upcomingVisits(visits)
    expect(result).toHaveLength(2)
    expect(result[0].visitTime).toBe(in3d)
    expect(result[1].visitTime).toBe(in6d)
  })

  it('空列表返回空', () => {
    expect(upcomingVisits([])).toEqual([])
  })
})
