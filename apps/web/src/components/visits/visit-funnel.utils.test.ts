import { describe, expect, it } from 'vitest'
import {
  dayGroupLabel,
  groupVisitTimeline,
  isThisWeek,
  matchVisitFilter,
  nextActionDeadlineState,
  splitByReviewing,
  startOfWeek,
  visitStats,
} from './visit-funnel.utils.js'
import type { Visit } from '../../hooks/use-visits.js'

/** 固定"现在"：2026-08-14（周五）12:00 本地时间 */
function now(): Date {
  return new Date(2026, 7, 14, 12, 0, 0)
}

/** 相对 now 的偏移天数的拜访（默认关联客户 c1） */
function makeVisit(offsetDays: number, overrides: Partial<Visit> = {}): Visit {
  const t = new Date(2026, 7, 14, 10, 0, 0)
  t.setDate(t.getDate() + offsetDays)
  return {
    id: `v-${offsetDays}-${Math.random().toString(36).slice(2, 7)}`,
    projectId: 'p1',
    companyId: 'c1',
    company: { id: 'c1', name: '示范大学' },
    visitTime: t.toISOString(),
    visitType: 'offline',
    createdAt: t.toISOString(),
    updatedAt: t.toISOString(),
    ...overrides,
  } as Visit
}

describe('startOfWeek / isThisWeek（周一起算）', () => {
  it('周五的本周起点是周一', () => {
    const monday = startOfWeek(now())
    expect(monday.getDay()).toBe(1)
    expect(monday.getDate()).toBe(10) // 2026-08-10 周一
  })

  it('周日的本周起点是上周一（中文惯例，不跨到新的一周）', () => {
    const sunday = new Date(2026, 7, 16, 9, 0, 0) // 2026-08-16 周日
    const monday = startOfWeek(sunday)
    expect(monday.getDate()).toBe(10)
  })

  it('本周一算、上周日不算', () => {
    expect(isThisWeek(new Date(2026, 7, 10, 0, 0, 0).toISOString(), now())).toBe(true)
    expect(isThisWeek(new Date(2026, 7, 9, 23, 59, 59).toISOString(), now())).toBe(false)
  })
})

describe('visitStats / matchVisitFilter（统计条即筛选器）', () => {
  const visits = [
    makeVisit(0, { workflowStage: 'REVIEWING', nextAction: '提交方案' }),
    makeVisit(-1, { nextAction: '发跟进邮件' }),
    makeVisit(-2, { companyId: undefined, company: undefined }),
    makeVisit(-30, { workflowStage: 'CLOSED' }),
  ]

  it('四个统计数字各按各的字段聚合', () => {
    expect(visitStats(visits, now())).toEqual({ week: 3, reviewing: 1, hasNext: 2, noCompany: 1 })
  })

  it('week / reviewing / hasNext / noCompany 四键各自过滤，all 全放行', () => {
    expect(visits.filter((v) => matchVisitFilter(v, 'week', now()))).toHaveLength(3)
    expect(visits.filter((v) => matchVisitFilter(v, 'reviewing', now()))).toHaveLength(1)
    expect(visits.filter((v) => matchVisitFilter(v, 'hasNext', now()))).toHaveLength(2)
    expect(visits.filter((v) => matchVisitFilter(v, 'noCompany', now()))).toHaveLength(1)
    expect(visits.filter((v) => matchVisitFilter(v, 'all', now()))).toHaveLength(4)
  })

  it('nextAction 只有空白不算已产生任务', () => {
    expect(matchVisitFilter(makeVisit(0, { nextAction: '   ' }), 'hasNext', now())).toBe(false)
  })
})

describe('splitByReviewing（待复盘置顶）', () => {
  it('REVIEWING 提出来，其余沉入时间线', () => {
    const a = makeVisit(0, { workflowStage: 'REVIEWING' })
    const b = makeVisit(-1, { workflowStage: 'CLOSED' })
    const { reviewing, rest } = splitByReviewing([b, a])
    expect(reviewing).toEqual([a])
    expect(rest).toEqual([b])
  })
})

describe('groupVisitTimeline（本周按天 / 更早折叠）', () => {
  it('今天/昨天各成组且组内新的在前，上周的沉入 earlier', () => {
    const todayAM = makeVisit(0)
    const todayPM = { ...makeVisit(0) }
    todayPM.visitTime = new Date(2026, 7, 14, 18, 0, 0).toISOString()
    const yesterday = makeVisit(-1)
    const lastWeek = makeVisit(-7)
    const { days, earlier } = groupVisitTimeline([lastWeek, yesterday, todayPM, todayAM], now())

    expect(days.map((d) => d.label)).toEqual(['今天', '昨天'])
    expect(days[0].visits.map((v) => v.id)).toEqual([todayPM.id, todayAM.id])
    expect(earlier.map((v) => v.id)).toEqual([lastWeek.id])
  })

  it('dayGroupLabel：今天/昨天走相对表述，更早落具体日期+周几', () => {
    expect(dayGroupLabel(new Date(2026, 7, 14), now())).toBe('今天')
    expect(dayGroupLabel(new Date(2026, 7, 13), now())).toBe('昨天')
    expect(dayGroupLabel(new Date(2026, 7, 11), now())).toBe('8月11日 周二')
  })
})

describe('nextActionDeadlineState（下一步截止分级）', () => {
  it('逾期 / 今天 / 以后 / 无截止', () => {
    expect(nextActionDeadlineState(new Date(2026, 7, 13).toISOString(), now())).toBe('overdue')
    expect(nextActionDeadlineState(new Date(2026, 7, 14, 23, 0).toISOString(), now())).toBe('today')
    expect(nextActionDeadlineState(new Date(2026, 7, 20).toISOString(), now())).toBe('future')
    expect(nextActionDeadlineState(undefined, now())).toBeNull()
  })
})
