import { describe, it, expect } from 'vitest'
import {
  computeCompanyCompleteness,
  getMissingFieldLabels,
  longestCommonSubsequence,
} from '../../../../src/crm/data-quality/data-quality.service.js'

describe('computeCompanyCompleteness', () => {
  it('returns full score for complete company', () => {
    const company = {
      name: 'Test',
      industry: 'education',
      scale: 'large',
      region: 'Beijing',
      level: 'key',
    }
    const contacts = [{ phone: '13800138000', decisionRole: 'DECISION_MAKER' }]
    const projects = [{ id: 'p1' }]
    const visits = [{ visitTime: new Date() }]

    const result = computeCompanyCompleteness(company, contacts, projects, visits)
    expect(result.score).toBe(100)
    expect(result.missingFields).toHaveLength(0)
  })

  it('detects missing fields', () => {
    const company = { name: 'Test' }
    const contacts: Array<{ phone?: string; decisionRole?: string }> = []
    const projects: unknown[] = []
    const visits: Array<{ visitTime: Date }> = []

    const result = computeCompanyCompleteness(company, contacts, projects, visits)
    expect(result.score).toBeLessThan(60)
    expect(result.missingFields).toContain('联系人及手机号')
    expect(result.missingFields).toContain('决策人')
    expect(result.missingFields).toContain('30天内拜访')
    expect(result.missingFields).toContain('关联线索或商机')
  })

  it('存量兼容：无联系人档案但公司平铺字段有联系人+电话 → 联系人维度得分', () => {
    const company = { name: '河南科技学院', contactPerson: '刘全永', contactPhone: '0373-3040395' }
    const result = computeCompanyCompleteness(company, [], [], [])
    expect(result.missingFields).not.toContain('联系人及手机号')
    // 决策人维度仍只认 Contact 档案（decisionRole 是档案属性）
    expect(result.missingFields).toContain('决策人')
  })

  it('平铺字段只有联系人没有电话 → 仍算缺失', () => {
    const company = { name: 'Test', contactPerson: '刘全永' }
    const result = computeCompanyCompleteness(company, [], [], [])
    expect(result.missingFields).toContain('联系人及手机号')
  })
})

describe('getMissingFieldLabels', () => {
  it('maps severity for known fields', () => {
    const result = getMissingFieldLabels(['客户名称', '决策人', '30天内拜访'])
    expect(result.find((r) => r.field === '客户名称')?.severity).toBe('high')
    expect(result.find((r) => r.field === '决策人')?.severity).toBe('high')
    expect(result.find((r) => r.field === '30天内拜访')?.severity).toBe('medium')
  })
})

describe('longestCommonSubsequence helper', () => {
  it('computes lcs length', () => {
    expect(longestCommonSubsequence('abcde', 'ace')).toBe(3)
  })
})
