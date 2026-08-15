import { describe, it, expect } from 'vitest'
import { calculateLeadScore, checkConversionReadiness } from '../../../src/crm/leads/leads.controller.js'
import { computeLeadDerivations } from '../../../src/crm/leads/leads.derivation.service.js'
import {
  CreateLeadSchema,
  FollowUpSchema,
  ConvertSchema,
  LoseSchema,
} from '../../../src/crm/leads/leads.schema.js'

describe('calculateLeadScore', () => {
  it('returns 0 and C grade for empty lead', () => {
    const result = calculateLeadScore({})
    expect(result.total).toBe(0)
    expect(result.grade).toBe('C')
  })

  it('gives full contact completeness for name + phone + position', () => {
    const result = calculateLeadScore({
      contactName: '张三',
      contactPhone: '13800000000',
      contactPosition: '处长',
    })
    expect(result.contactCompleteness).toBe(25)
  })

  it('gives full need clarity for requirements and timeline', () => {
    const result = calculateLeadScore({
      businessInfo: { requirements: '需要 AI 教学平台', timeline: '2026 春季' },
    })
    expect(result.needClarity).toBe(30)
  })

  it('gives 20 budget signal for budget amount', () => {
    const result = calculateLeadScore({
      financeInfo: { budget: '50 万' },
    })
    expect(result.budgetSignal).toBe(20)
  })

  it('gives partial budget signal for budget source only', () => {
    const result = calculateLeadScore({
      financeInfo: { budgetSource: '教务处经费' },
    })
    // ADR-0002 决策 4：budgetSource 单独只有 +5（不再给 10）
    expect(result.budgetSignal).toBe(5)
  })

  it('maps budget signal tiers to scores (ADR-0002)', () => {
    expect(calculateLeadScore({ financeInfo: { budgetSignal: 'none' } }).budgetSignal).toBe(0)
    expect(calculateLeadScore({ financeInfo: { budgetSignal: 'mentioned' } }).budgetSignal).toBe(10)
    expect(calculateLeadScore({ financeInfo: { budgetSignal: 'range' } }).budgetSignal).toBe(15)
    expect(calculateLeadScore({ financeInfo: { budgetSignal: 'confirmed' } }).budgetSignal).toBe(20)
    // 四档 + 来源 = 25 封顶
    expect(
      calculateLeadScore({ financeInfo: { budgetSignal: 'confirmed', budgetSource: '专项经费' } }).budgetSignal,
    ).toBe(25)
    // 存量 budget 文本按已确认档兼容
    expect(calculateLeadScore({ financeInfo: { budget: '50 万' } }).budgetSignal).toBe(20)
  })

  it('gives full decision chain clarity for decision maker and chain', () => {
    const result = calculateLeadScore({
      humanInfo: { decisionMaker: '信息中心主任', decisionChain: '信息中心 → 分管校长' },
    })
    expect(result.decisionChainClarity).toBe(20)
  })

  it('adds bonus for referral source', () => {
    const result = calculateLeadScore({ source: 'referral' })
    expect(result.bonus).toBe(5)
  })

  it('adds bonus for explicit timeline', () => {
    const result = calculateLeadScore({ businessInfo: { timeline: '2026 春季' } })
    expect(result.bonus).toBe(5)
  })

  it('caps total score at 100', () => {
    const result = calculateLeadScore({
      contactName: '张三',
      contactPhone: '13800000000',
      contactPosition: '处长',
      contactEmail: 'zhang@example.com',
      businessInfo: { requirements: 'AI 平台', timeline: '2026 春季' },
      financeInfo: { budget: '50 万', budgetSource: '教务处' },
      humanInfo: { decisionMaker: '主任', decisionChain: '信息中心 → 校长' },
      source: 'referral',
    })
    expect(result.total).toBe(100)
    expect(result.grade).toBe('A')
  })

  it('returns A for score >= 60', () => {
    const result = calculateLeadScore({
      contactName: '张三',
      contactPhone: '13800000000',
      contactPosition: '处长',
      businessInfo: { requirements: 'AI 平台' },
      financeInfo: { budget: '50 万' },
      humanInfo: { decisionMaker: '主任' },
    })
    expect(result.total).toBeGreaterThanOrEqual(60)
    expect(result.grade).toBe('A')
  })

  it('returns B for score 40-59', () => {
    const result = calculateLeadScore({
      contactName: '张三',
      contactPhone: '13800000000',
      contactPosition: '处长',
      businessInfo: { requirements: 'AI 平台' },
    })
    expect(result.total).toBeGreaterThanOrEqual(40)
    expect(result.total).toBeLessThan(60)
    expect(result.grade).toBe('B')
  })
})

describe('checkConversionReadiness', () => {
  it('returns not ready for empty lead with missing conditions', () => {
    const { ready, missing } = checkConversionReadiness({
      score: 0,
      completenessScore: 0,
      followUpCount: 0,
    })
    expect(ready).toBe(false)
    expect(missing.length).toBeGreaterThan(0)
    expect(missing).toContain('至少需要一个有效联系方式（电话或邮箱）')
    expect(missing).toContain('需求方向需明确')
    expect(missing).toContain('至少完成一次有效跟进')
    expect(missing).toContain('需识别决策链中的关键角色')
    // ADR-0002 决策 1：预算信号降为软提示，不进硬门禁
    expect(missing).not.toContain('需确认预算信号')
    expect((checkConversionReadiness({ score: 0, completenessScore: 0, followUpCount: 0 }) as { softHints: string[] }).softHints.length).toBeGreaterThan(0)
  })

  it('converts without budget confirmed (ADR-0002 soft hint)', () => {
    const { ready, missing, softHints } = checkConversionReadiness({
      score: 75,
      completenessScore: 50,
      contactPhone: '13800000000',
      followUpCount: 2,
      businessInfo: { requirements: 'AI 平台' },
      humanInfo: { decisionMaker: '主任' },
      financeInfo: {},
    })
    expect(ready).toBe(true)
    expect(missing).toEqual([])
    expect(softHints.length).toBeGreaterThan(0)
  })

  it('returns ready when all conditions are met', () => {
    const { ready, missing } = checkConversionReadiness({
      score: 75,
      completenessScore: 50,
      contactPhone: '13800000000',
      followUpCount: 2,
      businessInfo: { requirements: 'AI 平台' },
      humanInfo: { decisionMaker: '主任' },
      financeInfo: { budget: '50 万' },
    })
    expect(ready).toBe(true)
    expect(missing).toEqual([])
  })

  it('accepts completenessScore as fallback when score is low', () => {
    const { ready, missing } = checkConversionReadiness({
      score: 30,
      completenessScore: 70,
      contactPhone: '13800000000',
      followUpCount: 1,
      businessInfo: { requirements: 'AI 平台' },
      humanInfo: { decisionMaker: '主任' },
      financeInfo: { budget: '50 万' },
    })
    expect(ready).toBe(true)
    expect(missing).toEqual([])
  })
})

describe('computeLeadDerivations (ADR-0002)', () => {
  it('empty lead sits at step 1 with all elements missing', () => {
    const d = computeLeadDerivations({ completenessScore: 0, followUpCount: 0, status: 'FOLLOWING' })
    expect(d.currentStep.step).toBe(1)
    expect(d.fourElements.person).toBe('missing')
    expect(d.fourElements.business).toBe('missing')
    expect(d.fourElements.finance).toBe('missing')
    expect(d.fourElements.decisionChain).toBe('missing')
    expect(d.gate.passed).toBe(0)
  })

  it('advances steps as evidence lands', () => {
    const base = { completenessScore: 0, followUpCount: 0, status: 'FOLLOWING' as const }
    expect(computeLeadDerivations({ ...base, followUpCount: 1 }).currentStep.step).toBe(2)
    expect(
      computeLeadDerivations({ ...base, followUpCount: 1, businessInfo: { requirements: 'AI 平台' } }).currentStep.step,
    ).toBe(3)
    expect(
      computeLeadDerivations({ ...base, followUpCount: 1, businessInfo: { requirements: 'x' }, humanInfo: { decisionMaker: '主任' } }).currentStep.step,
    ).toBe(4)
    expect(
      computeLeadDerivations({ ...base, followUpCount: 1, businessInfo: { requirements: 'x' }, humanInfo: { decisionMaker: '主任' }, financeInfo: { budgetSignal: 'mentioned' } }).currentStep.step,
    ).toBe(5)
  })

  it('reaches step 7 only when gate 5/5 passed and still FOLLOWING', () => {
    const ready = {
      score: 75,
      completenessScore: 50,
      contactName: '李老师',
      contactPhone: '13800000000',
      contactPosition: '副处长',
      followUpCount: 2,
      businessInfo: { requirements: 'AI 平台' },
      humanInfo: { decisionMaker: '主任' },
      financeInfo: { budgetSignal: 'confirmed' },
      status: 'FOLLOWING' as const,
    }
    const d = computeLeadDerivations(ready)
    expect(d.gate.passed).toBe(5)
    expect(d.currentStep.step).toBe(7)
    expect(computeLeadDerivations({ ...ready, status: 'CONVERTED' }).currentStep.step).toBe(6)
  })

  it('aging tiers by grade: A=7d, B=14d, C=30d', () => {
    const elevenDaysAgo = new Date(Date.now() - 11 * 86400000)
    expect(computeLeadDerivations({ completenessScore: 0, followUpCount: 1, grade: 'A', lastFollowUpAt: elevenDaysAgo, status: 'FOLLOWING' }).aging).toBe('warning')
    expect(computeLeadDerivations({ completenessScore: 0, followUpCount: 1, grade: 'B', lastFollowUpAt: elevenDaysAgo, status: 'FOLLOWING' }).aging).toBe('ok')
    expect(computeLeadDerivations({ completenessScore: 0, followUpCount: 1, grade: 'B', lastFollowUpAt: new Date(Date.now() - 35 * 86400000), status: 'FOLLOWING' }).aging).toBe('overdue')
    // 已转化/流失不计算老化
    expect(computeLeadDerivations({ completenessScore: 0, followUpCount: 1, grade: 'A', lastFollowUpAt: elevenDaysAgo, status: 'CONVERTED' }).aging).toBe('ok')
  })
})

describe('leads schemas', () => {
  it('validates create lead input', () => {
    const input = {
      companyId: 'company_1',
      name: '测试学校',
      source: 'referral',
      contactName: '张三',
      humanInfo: { decisionMaker: '主任' },
      businessInfo: { requirements: 'AI 平台' },
      financeInfo: { budget: '50 万' },
    }
    const parsed = CreateLeadSchema.parse(input)
    expect(parsed.name).toBe('测试学校')
    expect(parsed.source).toBe('referral')
    expect(parsed.companyId).toBe('company_1')
  })

  it('validates follow-up input', () => {
    const parsed = FollowUpSchema.parse({
      content: '电话沟通，客户有兴趣',
      channel: 'phone',
      outcome: '约下周演示',
    })
    expect(parsed.content).toBe('电话沟通，客户有兴趣')
    expect(parsed.channel).toBe('phone')
  })

  it('rejects invalid follow-up channel', () => {
    expect(() => FollowUpSchema.parse({ content: 'test', channel: 'sms' })).toThrow()
  })

  it('validates convert input with force option', () => {
    const parsed = ConvertSchema.parse({ force: true, forceReason: '客户紧急' })
    expect(parsed.force).toBe(true)
    expect(parsed.forceReason).toBe('客户紧急')
  })

  it('validates lose input', () => {
    const parsed = LoseSchema.parse({ lostReason: '选择竞品' })
    expect(parsed.lostReason).toBe('选择竞品')
  })
})
