import { describe, it, expect } from 'vitest'
import { computeProjectDerivation, STALE_DAYS, ILLUSION_STALE_DAYS } from '../../../src/crm/projects/projects.derivation.service.js'

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000)

describe('computeProjectDerivation (ADR-0003)', () => {
  it('fresh project with chain and evidence gets high credibility', () => {
    const d = computeProjectDerivation(
      { updatedAt: daysAgo(3), milestone: 2, decisionMap: { nodes: [{}, {}] }, tasks: [] },
      3,
    )
    // 覆盖 3/(2+1)=100%×50 + 决策链2人×20 + 近14天×30 = 100
    expect(d.credibility).toBe(100)
    expect(d.staleDays).toBe(0)
    expect(d.illusion).toBe(false)
  })

  it('empty project at M0 gets low credibility', () => {
    const d = computeProjectDerivation(
      { updatedAt: daysAgo(20), milestone: 0, decisionMap: {}, tasks: [] },
      0,
    )
    // 无证据 0×50 + 无链 0 + 超14天 0 = 0
    expect(d.credibility).toBe(0)
  })

  it('evidence coverage capped at 100% of its 50% weight', () => {
    const d = computeProjectDerivation(
      { updatedAt: daysAgo(5), milestone: 1, decisionMap: {}, tasks: [] },
      99,
    )
    // min(1, 99/2)=1×50 + 0 + 30 = 80
    expect(d.credibility).toBe(80)
  })

  it('stale only when no waiting status and past threshold', () => {
    const stale = computeProjectDerivation(
      { updatedAt: daysAgo(STALE_DAYS + 5), milestone: 0, tasks: [] }, 0)
    expect(stale.staleDays).toBe(STALE_DAYS + 5)

    const waiting = computeProjectDerivation(
      { updatedAt: daysAgo(STALE_DAYS + 5), waitingStatus: 'BUDGET', milestone: 0, tasks: [] }, 0)
    expect(waiting.staleDays).toBe(0)
    expect(waiting.waiting).toBe(true)

    const closed = computeProjectDerivation(
      { updatedAt: daysAgo(STALE_DAYS + 5), closedAt: daysAgo(1), milestone: 0, tasks: [] }, 0)
    expect(closed.staleDays).toBe(0)
  })

  it('illusion when 15+ days without push and zero evidence (waiting excluded)', () => {
    const d = computeProjectDerivation(
      { updatedAt: daysAgo(ILLUSION_STALE_DAYS), milestone: 3, decisionMap: { nodes: [{}, {}, {}] }, tasks: [] },
      0,
    )
    expect(d.illusion).toBe(true)

    // 有证据链的不算幻觉（只是可能停滞）
    const withEvidence = computeProjectDerivation(
      { updatedAt: daysAgo(ILLUSION_STALE_DAYS), milestone: 3, tasks: [] },
      5,
    )
    expect(withEvidence.illusion).toBe(false)

    // 等待中不算
    const waiting = computeProjectDerivation(
      { updatedAt: daysAgo(ILLUSION_STALE_DAYS), waitingStatus: 'BUDGET', milestone: 3, tasks: [] },
      0,
    )
    expect(waiting.illusion).toBe(false)
  })

  it('nextAction picks earliest pending task with deadline', () => {
    const d = computeProjectDerivation({
      updatedAt: daysAgo(1), milestone: 0, tasks: [
        { title: '晚的任务', deadline: daysAgo(-10), status: 'PENDING' },
        { title: '早的任务', deadline: daysAgo(-2), status: 'PENDING' },
        { title: '已完成', deadline: daysAgo(-1), status: 'COMPLETED' },
      ],
    }, 0)
    expect(d.nextAction?.title).toBe('早的任务')
  })
})
