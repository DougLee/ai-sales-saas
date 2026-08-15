import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractBidResult,
  extractGateSignals,
  captureBidResultFromChat,
  captureGateSignalsFromChat,
} from '../../../../../src/agents/skills/crm/gate-extraction.util.js'

vi.mock('../../../../../src/agents/core/agent-memory.js', () => ({
  agentMemory: {
    getJSON: vi.fn().mockResolvedValue(null),
    setJSON: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../../../../src/infra/logger.js', () => ({
  getComponentLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const { agentMemory } = await import('../../../../../src/agents/core/agent-memory.js')

describe('extractBidResult（招投标回答 → 中标结果）', () => {
  it('提取我方中标的金额表述', () => {
    const r = extractBidResult('根据中标公告，我方成功中标：金额128万元，工期90天。')
    expect(r).not.toBeNull()
    expect(r!.content).toContain('128万')
  })

  it('命中我方签约/合同金额表述', () => {
    expect(extractBidResult('我们签约：开封大学实验室建设项目')).toMatchObject({
      content: expect.stringContaining('开封大学'),
    })
    expect(extractBidResult('本公司合同金额：56万')).toMatchObject({
      content: expect.stringContaining('56万'),
    })
  })

  it('补充中标公告编号', () => {
    const r = extractBidResult('我方中标：智慧教室项目。中标公告编号：CGB-2026-0115')
    expect(r!.announcementNo).toBe('CGB-2026-0115')
    expect(r!.content).toContain('CGB-2026-0115')
  })

  it('公告编号单独出现不触发（主表述是触发条件）', () => {
    expect(extractBidResult('监测到中标公告编号 ZC-20260801')).toBeNull()
  })

  it('竞品中标/无中标表述返回 null', () => {
    expect(extractBidResult('竞品XX公司中标了郑州大学项目')).toBeNull()
    expect(extractBidResult('本周未检索到相关中标公告。')).toBeNull()
    expect(extractBidResult('')).toBeNull()
  })
})

describe('extractGateSignals（对话 → gate 字段信号）', () => {
  it('提取预算金额（阿拉伯/中文数字）', () => {
    expect(extractGateSignals('客户说预算大概300万左右')).toContainEqual(
      expect.objectContaining({ field: 'budget', content: expect.stringContaining('300万') }),
    )
    expect(extractGateSignals('预算约为两百万')).toContainEqual(
      expect.objectContaining({ field: 'budget' }),
    )
  })

  it('提取我方报价（区分客户预算）', () => {
    const r = extractGateSignals('我方报价为268万，含三年维保')
    expect(r).toContainEqual(
      expect.objectContaining({ field: 'price', content: expect.stringContaining('268万') }),
    )
    // 客户预算语境不应被误判成报价
    const onlyBudget = extractGateSignals('客户预算300万')
    expect(onlyBudget.find((s) => s.field === 'price')).toBeUndefined()
  })

  it('提取拍板人（关键词先行 + 姓名职务决策动词）', () => {
    expect(extractGateSignals('拍板人是张伟副校长')).toContainEqual(
      expect.objectContaining({ field: 'decision_maker', name: '张伟', role: '副校长' }),
    )
    expect(extractGateSignals('李明处长最终决定采购方案')).toContainEqual(
      expect.objectContaining({ field: 'decision_maker', name: '李明', role: '处长' }),
    )
  })

  it('提取量化需求指标', () => {
    expect(extractGateSignals('他们要求不低于120台智慧黑板')).toContainEqual(
      expect.objectContaining({ field: 'requirement', content: expect.stringContaining('120台') }),
    )
  })

  it('多字段一次命中 + 同字段去重取首 hit', () => {
    const r = extractGateSignals('客户预算200万，我方报价185万，需要50台设备，拍板人是王芳院长')
    const fields = r.map((s) => s.field)
    expect(fields).toEqual(expect.arrayContaining(['budget', 'price', 'requirement', 'decision_maker']))
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('无关文本返回空数组', () => {
    expect(extractGateSignals('今天天气不错，聊聊进展')).toEqual([])
    expect(extractGateSignals('')).toEqual([])
  })
})

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    project: {
      findFirst: vi.fn().mockResolvedValue({
        ownerId: 'owner_1',
        evidence: {},
        financeInfo: {},
        humanInfo: {},
        decisionMap: {},
      }),
    },
    aiPendingItem: {
      create: vi.fn().mockResolvedValue({ id: 'item_1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as never
}

describe('captureBidResultFromChat（待确认队列编排）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('命中 → 创建 bid_result 待确认项（status pending，不直写）', async () => {
    const prisma = createMockPrisma()
    const n = await captureBidResultFromChat({
      assistantText: '我方成功中标：金额128万元',
      sessionId: 'sess_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prisma,
      projectId: 'proj_1',
    })
    expect(n).toBe(1)
    expect((prisma as any).aiPendingItem.create).toHaveBeenCalledTimes(1)
    const createdData = (prisma as any).aiPendingItem.create.mock.calls[0][0].data
    expect(createdData).toMatchObject({
      itemType: 'bid_result',
      projectId: 'proj_1',
      ownerId: 'owner_1',
    })
    expect(createdData.status).toBeUndefined() // 不显式设置 status：走默认 pending，不直写
  })

  it('项目已有 bidResult 事实 → 跳过（幂等）', async () => {
    const prisma = createMockPrisma({
      project: {
        findFirst: vi.fn().mockResolvedValue({ ownerId: 'owner_1', evidence: { bidResult: '已中标' } }),
      },
    })
    const n = await captureBidResultFromChat({
      assistantText: '我方中标：128万',
      sessionId: 'sess_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prisma,
      projectId: 'proj_1',
    })
    expect(n).toBe(0)
    expect((prisma as any).aiPendingItem.create).not.toHaveBeenCalled()
  })

  it('同内容 pending 条目已存在 → 跳过（去重）', async () => {
    const prisma = createMockPrisma({
      aiPendingItem: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          { itemData: { content: '金额128万元（公告编号 CGB-2026-0115）' } },
        ]),
      },
    })
    const n = await captureBidResultFromChat({
      assistantText: '我方中标：金额128万元。中标公告编号：CGB-2026-0115',
      sessionId: 'sess_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prisma,
      projectId: 'proj_1',
    })
    expect(n).toBe(0)
    expect((prisma as any).aiPendingItem.create).not.toHaveBeenCalled()
  })

  it('项目不存在 → 跳过', async () => {
    const prisma = createMockPrisma({
      project: { findFirst: vi.fn().mockResolvedValue(null) },
    })
    const n = await captureBidResultFromChat({
      assistantText: '我方中标：128万',
      sessionId: 'sess_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prisma,
      projectId: 'proj_x',
    })
    expect(n).toBe(0)
  })
})

describe('captureGateSignalsFromChat（节流 + 待确认队列编排）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(agentMemory.getJSON).mockResolvedValue(null)
  })

  it('命中 → 按 itemType 建待确认项并写会话节流 KV', async () => {
    const prisma = createMockPrisma()
    const n = await captureGateSignalsFromChat({
      userMessage: '客户预算300万，拍板人是张伟副校长',
      assistantText: '好的，已记录。',
      sessionId: 'sess_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prisma,
      projectId: 'proj_1',
    })
    expect(n).toBe(2)
    const calls = (prisma as any).aiPendingItem.create.mock.calls
    const types = calls.map((c: any[]) => c[0].data.itemType).sort()
    expect(types).toEqual(['budget_signal', 'decision_chain'])
    const chainCall = calls.find((c: any[]) => c[0].data.itemType === 'decision_chain')[0].data.itemData
    expect(chainCall.chain).toEqual([{ name: '张伟', role: '副校长', attitude: 'NEUTRAL' }])
    expect(agentMemory.setJSON).toHaveBeenCalledWith('sess_1', 'gate-fields-extracted', {
      budget: expect.any(String),
      decision_maker: expect.any(String),
    })
  })

  it('节流：本会话已提取过的字段不再建', async () => {
    vi.mocked(agentMemory.getJSON).mockResolvedValue({ budget: '预算300万' })
    const prisma = createMockPrisma()
    const n = await captureGateSignalsFromChat({
      userMessage: '客户预算又是300万',
      assistantText: '预算之前聊过。',
      sessionId: 'sess_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prisma,
      projectId: 'proj_1',
    })
    expect(n).toBe(0)
    expect((prisma as any).aiPendingItem.create).not.toHaveBeenCalled()
  })

  it('档案已有值（预算已填）→ 该字段跳过', async () => {
    const prisma = createMockPrisma({
      project: {
        findFirst: vi.fn().mockResolvedValue({
          ownerId: 'owner_1',
          financeInfo: { budget: '300万' },
          humanInfo: {},
          decisionMap: {},
        }),
      },
    })
    const n = await captureGateSignalsFromChat({
      userMessage: '客户预算300万',
      assistantText: '',
      sessionId: 'sess_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prisma,
      projectId: 'proj_1',
    })
    expect(n).toBe(0)
    expect((prisma as any).aiPendingItem.create).not.toHaveBeenCalled()
  })
})
