import { describe, expect, it } from 'vitest'
import {
  FIVE_ROLES,
  firstMissingCriticalRole,
  isPendingRole,
  lacksDecisionMaker,
  missingCriticalRoles,
  roleMetaOf,
} from './roles.js'

describe('五角色元数据（对齐 #38 矩阵色系）', () => {
  it('五角色齐全：决策者/影响力者/使用者/切入者/待定', () => {
    expect(FIVE_ROLES.map((r) => r.label)).toEqual(['决策者', '影响力者', '使用者', '切入者', '待定'])
  })

  it('roleMetaOf：已知角色取对应元数据，未标注/未知值归待定', () => {
    expect(roleMetaOf('DECISION_MAKER').tone).toBe('danger')
    expect(roleMetaOf('EVALUATOR').tone).toBe('warning')
    expect(roleMetaOf('USER').tone).toBe('success')
    expect(roleMetaOf('COACH').tone).toBe('primary')
    expect(roleMetaOf(undefined).key).toBe('__pending__')
    expect(roleMetaOf(null).key).toBe('__pending__')
    expect(roleMetaOf('GATEKEEPER').key).toBe('__pending__')
    expect(roleMetaOf('SOMETHING_NEW').key).toBe('__pending__')
  })

  it('isPendingRole：GATEKEEPER 与未标注都进待定桶', () => {
    expect(isPendingRole('GATEKEEPER')).toBe(true)
    expect(isPendingRole(undefined)).toBe(true)
    expect(isPendingRole('DECISION_MAKER')).toBe(false)
  })
})

describe('缺角预警（关键角色覆盖检查）', () => {
  it('无联系人不预警（另有录入引导）', () => {
    expect(missingCriticalRoles([])).toEqual([])
  })

  it('决策者 + 影响力者齐备 → 无预警', () => {
    const contacts = [{ decisionRole: 'DECISION_MAKER' }, { decisionRole: 'EVALUATOR' }]
    expect(missingCriticalRoles(contacts)).toEqual([])
  })

  it('只有切入者 → 缺决策者、影响力者', () => {
    expect(missingCriticalRoles([{ decisionRole: 'COACH' }])).toEqual(['决策者', '影响力者'])
  })

  it('有决策者但缺影响力者', () => {
    expect(missingCriticalRoles([{ decisionRole: 'DECISION_MAKER' }])).toEqual(['影响力者'])
  })

  it('firstMissingCriticalRole：优先补决策者', () => {
    expect(firstMissingCriticalRole([{ decisionRole: 'COACH' }])).toBe('DECISION_MAKER')
    expect(firstMissingCriticalRole([{ decisionRole: 'DECISION_MAKER' }])).toBe('EVALUATOR')
    expect(firstMissingCriticalRole([{ decisionRole: 'DECISION_MAKER' }, { decisionRole: 'EVALUATOR' }])).toBeUndefined()
  })
})

describe('督导口径：缺决策者判定', () => {
  it('无联系人不算缺决策者（归「无联系人」口径，不双重计数）', () => {
    expect(lacksDecisionMaker([])).toBe(false)
  })

  it('有联系人但无决策者 → true', () => {
    expect(lacksDecisionMaker([{ decisionRole: 'COACH' }, { decisionRole: 'USER' }])).toBe(true)
  })

  it('含决策者 → false', () => {
    expect(lacksDecisionMaker([{ decisionRole: 'COACH' }, { decisionRole: 'DECISION_MAKER' }])).toBe(false)
  })
})
