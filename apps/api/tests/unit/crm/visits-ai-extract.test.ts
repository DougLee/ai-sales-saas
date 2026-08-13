import { describe, expect, it } from 'vitest'
import { normalizeExtractedVisit } from '../../../src/crm/visits/visits.ai.controller.js'

/**
 * 语音拜访提取（/api/visits/extract）输出规范化：
 * LLM 常把缺省字段输出为 null / 空串 / 非法日期，
 * 而 CreateVisitSchema 的 z.string().optional() 只认 undefined，null 会 400。
 */
describe('normalizeExtractedVisit', () => {
  it('strips null / empty-string optional fields', () => {
    const out = normalizeExtractedVisit({
      summary: '拜访了信息工程学院',
      visitType: 'offline',
      contactName: null,
      contactPosition: null,
      nextAction: null,
      projectName: '',
    })
    expect(out).not.toHaveProperty('contactName')
    expect(out).not.toHaveProperty('contactPosition')
    expect(out).not.toHaveProperty('nextAction')
    expect(out).not.toHaveProperty('projectName')
    expect(out.summary).toBe('拜访了信息工程学院')
  })

  it('keeps non-empty string fields', () => {
    const out = normalizeExtractedVisit({
      contactName: '郑文奎',
      contactPosition: '处长',
      nextAction: '下周提交方案',
    })
    expect(out.contactName).toBe('郑文奎')
    expect(out.contactPosition).toBe('处长')
    expect(out.nextAction).toBe('下周提交方案')
  })

  it('normalizes valid dates to ISO and drops invalid/null dates', () => {
    const out = normalizeExtractedVisit({
      visitTime: '2026-04-21 16:00',
      nextActionDeadline: null,
    })
    expect(typeof out.visitTime).toBe('string')
    expect(new Date(out.visitTime as string).toISOString()).toBe(out.visitTime)
    expect(out).not.toHaveProperty('nextActionDeadline')
  })

  it('drops garbage date strings instead of passing them through', () => {
    const out = normalizeExtractedVisit({ visitTime: '下周三下午' })
    expect(out).not.toHaveProperty('visitTime')
  })

  it('coerces invalid visitType to offline', () => {
    expect(normalizeExtractedVisit({ visitType: 'video' }).visitType).toBe('offline')
    expect(normalizeExtractedVisit({ visitType: null }).visitType).toBe('offline')
    expect(normalizeExtractedVisit({ visitType: 'online' }).visitType).toBe('online')
    expect(normalizeExtractedVisit({}).visitType).toBe('offline')
  })
})
