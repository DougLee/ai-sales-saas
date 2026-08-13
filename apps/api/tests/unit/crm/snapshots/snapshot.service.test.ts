import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  renderFullSnapshotPrompt,
  renderIncrementalSnapshotPrompt,
  parseSnapshotResponse,
  type SnapshotContext,
} from '@/crm/snapshots/snapshot.service'

const baseCtx = (overrides: Partial<SnapshotContext> = {}): SnapshotContext => ({
  projectId: 'p1',
  projectName: '示范项目',
  companyName: '示范客户',
  ownerName: '张三',
  currentStage: 3,
  daysInStage: 12,
  incremental: false,
  previousLayers: undefined,
  events: [
    { eventType: 'visit.completed', eventTime: new Date('2026-08-01'), aiInsight: '客户反馈良好', summary: '' },
    { eventType: 'milestone.advanced', eventTime: new Date('2026-07-25'), aiInsight: null, summary: 'stage=2 -> 3' },
  ],
  closureStats: { closed: 3, open: 1, pendingConfirm: 2 },
  estimatedTokens: 0,
  ...overrides,
})

describe('snapshot.service', () => {
  describe('estimateTokens', () => {
    it('returns 0 for empty', () => {
      expect(estimateTokens('')).toBe(0)
    })
    it('rounds up length/4', () => {
      expect(estimateTokens('a'.repeat(100))).toBe(25)
      expect(estimateTokens('a'.repeat(101))).toBe(26)
    })
  })

  describe('renderFullSnapshotPrompt', () => {
    it('contains project meta + events', () => {
      const prompt = renderFullSnapshotPrompt(baseCtx())
      expect(prompt).toContain('示范项目')
      expect(prompt).toContain('M3')
      expect(prompt).toContain('客户反馈良好')
      expect(prompt).toContain('已闭环 3 次')
    })

    it('handles empty events with placeholder', () => {
      const prompt = renderFullSnapshotPrompt(baseCtx({ events: [] }))
      expect(prompt).toContain('暂无事件')
    })
  })

  describe('renderIncrementalSnapshotPrompt', () => {
    it('contains previous layers + new events', () => {
      const prompt = renderIncrementalSnapshotPrompt(
        baseCtx({
          incremental: true,
          previousLayers: {
            weeklySummary: '上周：客户犹豫',
            monthlySummary: '本月关系稳',
            quarterlyView: '季度关注预算',
            healthScore: 70,
          },
          events: [
            { eventType: 'visit.completed', eventTime: new Date('2026-08-08'), aiInsight: '确认预算', summary: '' },
          ],
        }),
      )
      expect(prompt).toContain('上周：客户犹豫')
      expect(prompt).toContain('70')
      expect(prompt).toContain('确认预算')
    })

    it('handles no new events', () => {
      const prompt = renderIncrementalSnapshotPrompt(baseCtx({ incremental: true, events: [] }))
      expect(prompt).toContain('暂无新事件')
    })
  })

  describe('parseSnapshotResponse', () => {
    it('parses clean JSON', () => {
      const raw = JSON.stringify({
        weeklySummary: '本周关键',
        monthlySummary: '本月趋势',
        quarterlyView: '季度展望',
        healthScore: 75,
        riskFlags: [{ type: 'stale', severity: 'medium', description: '停滞中' }],
        nextActions: [{ action: '拜访', priority: 'high', expectedImpact: '推动关系' }],
      })
      const parsed = parseSnapshotResponse(raw)
      expect(parsed.healthScore).toBe(75)
      expect(parsed.riskFlags).toHaveLength(1)
      expect(parsed.nextActions[0].priority).toBe('high')
    })

    it('strips ```json fences', () => {
      const raw = '```json\n{"weeklySummary":"x","healthScore":80,"riskFlags":[],"nextActions":[]}\n```'
      const parsed = parseSnapshotResponse(raw)
      expect(parsed.healthScore).toBe(80)
      expect(parsed.weeklySummary).toBe('x')
    })

    it('falls back on malformed input', () => {
      const parsed = parseSnapshotResponse('not json at all')
      expect(parsed.healthScore).toBe(60)
      expect(parsed.riskFlags).toEqual([])
    })

    it('clamps invalid healthScore into [0,100]', () => {
      const parsed = parseSnapshotResponse(
        JSON.stringify({ weeklySummary: '', healthScore: 9999, riskFlags: [], nextActions: [] }),
      )
      expect(parsed.healthScore).toBe(100)
      const parsed2 = parseSnapshotResponse(
        JSON.stringify({ weeklySummary: '', healthScore: -50, riskFlags: [], nextActions: [] }),
      )
      expect(parsed2.healthScore).toBe(0)
    })

    it('coerces invalid severity/priority to safe defaults', () => {
      const parsed = parseSnapshotResponse(
        JSON.stringify({
          weeklySummary: '',
          healthScore: 50,
          riskFlags: [{ type: 'x', severity: 'catastrophic', description: 'd' }],
          nextActions: [{ action: 'a', priority: 'urgent', expectedImpact: 'i' }],
        }),
      )
      expect(parsed.riskFlags[0].severity).toBe('low')
      expect(parsed.nextActions[0].priority).toBe('medium')
    })
  })
})