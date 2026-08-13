import { describe, it, expect, vi } from 'vitest'
import {
  validateMilestoneAdvance,
  getNestedValue,
  isEmptyValue,
  DEFAULT_MILESTONE_GATES,
  loadMilestoneGates,
} from '../../../src/milestone-gate/index.js'

function createMockPrisma(projectData: Record<string, unknown>) {
  return {
    project: {
      findFirst: vi.fn().mockResolvedValue(projectData),
    },
    timelineEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as Parameters<typeof validateMilestoneAdvance>[0]
}

function createMockPrismaWithEvidence(
  projectData: Record<string, unknown>,
  evidenceChain: Array<{
    timelineEventId: string
    evidenceSegment?: string
  }>,
  timelineEvents: Array<{
    id: string
    sourceType: string
    eventTime: Date
  }>,
) {
  return {
    project: {
      findFirst: vi.fn().mockResolvedValue({ ...projectData, evidenceChain }),
    },
    timelineEvent: {
      findMany: vi.fn().mockResolvedValue(timelineEvents),
    },
  } as unknown as Parameters<typeof validateMilestoneAdvance>[0]
}

describe('getNestedValue', () => {
  it('returns nested value by path', () => {
    const obj = { humanInfo: { firstContact: '电话' } }
    expect(getNestedValue(obj, 'humanInfo.firstContact')).toBe('电话')
  })

  it('returns undefined for missing path', () => {
    const obj = { humanInfo: {} }
    expect(getNestedValue(obj, 'humanInfo.firstContact')).toBeUndefined()
  })

  it('returns undefined for non-object intermediate', () => {
    const obj = { humanInfo: { firstContact: null } }
    expect(getNestedValue(obj, 'humanInfo.firstContact.extra')).toBeUndefined()
  })
})

describe('isEmptyValue', () => {
  it('treats null/undefined as empty', () => {
    expect(isEmptyValue(null)).toBe(true)
    expect(isEmptyValue(undefined)).toBe(true)
  })

  it('treats blank string as empty', () => {
    expect(isEmptyValue('')).toBe(true)
    expect(isEmptyValue('   ')).toBe(true)
  })

  it('treats empty array as empty', () => {
    expect(isEmptyValue([])).toBe(true)
  })

  it('treats empty object as empty', () => {
    expect(isEmptyValue({})).toBe(true)
  })

  it('treats non-empty values as not empty', () => {
    expect(isEmptyValue('电话')).toBe(false)
    expect(isEmptyValue(['痛点'])).toBe(false)
    expect(isEmptyValue({ key: 'value' })).toBe(false)
    expect(isEmptyValue(0)).toBe(false)
  })
})

describe('validateMilestoneAdvance', () => {
  it('passes when all required fields are present', async () => {
    const prisma = createMockPrisma({
      humanInfo: { firstContact: '电话' },
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 0, 1)

    expect(result.passed).toBe(true)
    expect(result.missing).toHaveLength(0)
    expect(result.fromStage).toBe(0)
    expect(result.toStage).toBe(1)
  })

  it('fails when required field is missing', async () => {
    const prisma = createMockPrisma({
      humanInfo: {},
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 0, 1)

    expect(result.passed).toBe(false)
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0]).toEqual({ path: 'humanInfo.firstContact', label: '首次接触方式' })
  })

  it('fails when painPoints is empty array', async () => {
    const prisma = createMockPrisma({
      humanInfo: { painPoints: [] },
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 1, 2)

    expect(result.passed).toBe(false)
    expect(result.missing[0]).toEqual({ path: 'humanInfo.painPoints', label: '痛点列表' })
  })

  it('passes when painPoints has items', async () => {
    const prisma = createMockPrisma({
      humanInfo: { painPoints: ['效率低'] },
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 1, 2)

    expect(result.passed).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('skips validation when target stage is lower than current', async () => {
    const prisma = createMockPrisma({
      humanInfo: {},
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 3, 2)

    expect(result.passed).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('skips validation when target stage equals current', async () => {
    const prisma = createMockPrisma({
      humanInfo: {},
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 2, 2)

    expect(result.passed).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('passes when no gate defined for current stage', async () => {
    const prisma = createMockPrisma({
      humanInfo: {},
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 99, 100)

    expect(result.passed).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('returns all missing fields for multi-field gates', async () => {
    const prisma = createMockPrisma({
      humanInfo: {},
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const customGates = [
      {
        fromStage: 0,
        requiredFields: [
          { path: 'humanInfo.firstContact', label: '首次接触方式' },
          { path: 'humanInfo.painPoints', label: '痛点列表' },
        ],
      },
    ]

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 0, 1, customGates)

    expect(result.passed).toBe(false)
    expect(result.missing).toHaveLength(2)
    expect(result.missing.map((m) => m.label)).toEqual(['首次接触方式', '痛点列表'])
  })

  it('uses provided custom validate function', async () => {
    const prisma = createMockPrisma({
      humanInfo: { firstContact: '电话' },
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const customGates = [
      {
        fromStage: 0,
        requiredFields: [
          {
            path: 'humanInfo.firstContact',
            label: '首次接触方式',
            validate: (v: unknown) => typeof v === 'string' && v.startsWith('电话'),
          },
        ],
      },
    ]

    const passResult = await validateMilestoneAdvance(prisma, 'proj_1', 0, 1, customGates)
    expect(passResult.passed).toBe(true)

    const failPrisma = createMockPrisma({
      humanInfo: { firstContact: '邮件' },
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })
    const failResult = await validateMilestoneAdvance(failPrisma, 'proj_1', 0, 1, customGates)
    expect(failResult.passed).toBe(false)
  })

  it('exposes DEFAULT_MILESTONE_GATES with 9 stages', () => {
    expect(DEFAULT_MILESTONE_GATES).toHaveLength(9)
    expect(DEFAULT_MILESTONE_GATES[8].requiredFields).toHaveLength(0)
  })
})

describe('loadMilestoneGates', () => {
  it('falls back to DEFAULT_MILESTONE_GATES when no MILESTONE config exists', async () => {
    const prisma = {
      methodologyConfig: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Parameters<typeof loadMilestoneGates>[0]

    const gates = await loadMilestoneGates(prisma, 'tenant_1')

    expect(gates).toHaveLength(9)
    expect(gates[1].requiredFields[0].path).toBe('humanInfo.painPoints')
  })

  it('loads custom gate rules from MethodologyConfig', async () => {
    const prisma = {
      methodologyConfig: {
        findFirst: vi.fn().mockResolvedValue({
          configJson: {
            stages: [],
            gateRules: [
              {
                fromStage: 0,
                requiredFields: [
                  { path: 'humanInfo.firstContact', label: '首次接触方式' },
                  { path: 'customField.note', label: '备注', validator: 'stringMinLength', params: { min: 2 } },
                ],
              },
            ],
          },
        }),
      },
    } as unknown as Parameters<typeof loadMilestoneGates>[0]

    const gates = await loadMilestoneGates(prisma, 'tenant_1')

    expect(gates).toHaveLength(1)
    expect(gates[0].requiredFields).toHaveLength(2)

    const project = {
      humanInfo: { firstContact: '电话' },
      customField: { note: 'x' },
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    }
    const fail = await validateMilestoneAdvance(
      { project: { findFirst: vi.fn().mockResolvedValue(project) } } as unknown as Parameters<typeof validateMilestoneAdvance>[0],
      'proj_1',
      0,
      1,
      gates,
    )
    expect(fail.passed).toBe(false)
    expect(fail.missing[0].label).toBe('备注')

    const passProject = { ...project, customField: { note: 'ok' } }
    const pass = await validateMilestoneAdvance(
      { project: { findFirst: vi.fn().mockResolvedValue(passProject) } } as unknown as Parameters<typeof validateMilestoneAdvance>[0],
      'proj_1',
      0,
      1,
      gates,
    )
    expect(pass.passed).toBe(true)
  })

  it('falls back to default gates when config gateRules is empty', async () => {
    const prisma = {
      methodologyConfig: {
        findFirst: vi.fn().mockResolvedValue({
          configJson: { stages: [], gateRules: [] },
        }),
      },
    } as unknown as Parameters<typeof loadMilestoneGates>[0]

    const gates = await loadMilestoneGates(prisma, 'tenant_1')

    expect(gates).toHaveLength(9)
  })
})

describe('evidence chain validation', () => {
  it('fails when evidence requirement is not met', async () => {
    const prisma = createMockPrismaWithEvidence(
      {
        humanInfo: { firstContact: '电话' },
        businessInfo: {},
        financeInfo: {},
        decisionMap: {},
        evidence: [],
      },
      [],
      [],
    )

    const customGates = [
      {
        fromStage: 0,
        requiredFields: [
          {
            path: 'humanInfo.firstContact',
            label: '首次接触方式',
            evidence: [{ type: 'visit', min: 1 }],
          },
        ],
      },
    ]

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 0, 1, customGates)

    expect(result.passed).toBe(false)
    expect(result.missing.some((m) => m.label.includes('缺少证据'))).toBe(true)
  })

  it('passes when evidence requirement is met', async () => {
    const now = new Date()
    const prisma = createMockPrismaWithEvidence(
      {
        humanInfo: { firstContact: '电话' },
        businessInfo: {},
        financeInfo: {},
        decisionMap: {},
        evidence: [],
      },
      [{ timelineEventId: 'te_1', evidenceSegment: '拜访记录' }],
      [{ id: 'te_1', sourceType: 'visit', eventTime: now }],
    )

    const customGates = [
      {
        fromStage: 0,
        requiredFields: [
          {
            path: 'humanInfo.firstContact',
            label: '首次接触方式',
            evidence: [{ type: 'visit', min: 1 }],
          },
        ],
      },
    ]

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 0, 1, customGates)

    expect(result.passed).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('fails when evidence is too old', async () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    const prisma = createMockPrismaWithEvidence(
      {
        humanInfo: { firstContact: '电话' },
        businessInfo: {},
        financeInfo: {},
        decisionMap: {},
        evidence: [],
      },
      [{ timelineEventId: 'te_1', evidenceSegment: '旧拜访记录' }],
      [{ id: 'te_1', sourceType: 'visit', eventTime: oldDate }],
    )

    const customGates = [
      {
        fromStage: 0,
        requiredFields: [
          {
            path: 'humanInfo.firstContact',
            label: '首次接触方式',
            evidence: [{ type: 'visit', min: 1, withinDays: 30 }],
          },
        ],
      },
    ]

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 0, 1, customGates)

    expect(result.passed).toBe(false)
    expect(result.missing.some((m) => m.label.includes('最近 30 天内'))).toBe(true)
  })
})

describe('compound rules', () => {
  it('and rule fails when any child fails', async () => {
    const prisma = createMockPrisma({
      humanInfo: { firstContact: '电话' },
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const customGates = [
      {
        fromStage: 0,
        requiredFields: [
          {
            operator: 'and',
            label: '客户基础信息完整',
            rules: [
              { path: 'humanInfo.firstContact', label: '首次接触方式' },
              { path: 'businessInfo.requirements', label: '需求指标' },
            ],
          },
        ],
      },
    ]

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 0, 1, customGates)

    expect(result.passed).toBe(false)
    expect(result.missing.some((m) => m.label === '需求指标')).toBe(true)
  })

  it('or rule passes when any child passes', async () => {
    const prisma = createMockPrisma({
      humanInfo: { firstContact: '电话' },
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const customGates = [
      {
        fromStage: 0,
        requiredFields: [
          {
            operator: 'or',
            label: '已建立联系或确认需求',
            rules: [
              { path: 'humanInfo.firstContact', label: '首次接触方式' },
              { path: 'businessInfo.requirements', label: '需求指标' },
            ],
          },
        ],
      },
    ]

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 0, 1, customGates)

    expect(result.passed).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('not rule fails when child passes', async () => {
    const prisma = createMockPrisma({
      humanInfo: { firstContact: '电话' },
      businessInfo: {},
      financeInfo: {},
      decisionMap: {},
      evidence: [],
    })

    const customGates = [
      {
        fromStage: 0,
        requiredFields: [
          {
            operator: 'not',
            label: '尚未建立联系',
            rules: [{ path: 'humanInfo.firstContact', label: '首次接触方式' }],
          },
        ],
      },
    ]

    const result = await validateMilestoneAdvance(prisma, 'proj_1', 0, 1, customGates)

    expect(result.passed).toBe(false)
    expect(result.missing[0].label).toBe('尚未建立联系')
  })
})
