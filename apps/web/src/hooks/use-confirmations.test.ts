import { describe, it, expect } from 'vitest'
import {
  groupByEntity,
  groupVisitBlocks,
  buildVisitDigest,
  buildChecklistRow,
  entityKindLabel,
  summarizeItem,
  describeItem,
  buildFormSpec,
  buildReviewPrompt,
  extractEvidence,
  type PendingItem,
} from './use-confirmations.js'

function makeItem(overrides: Partial<PendingItem>): PendingItem {
  return {
    id: Math.random().toString(36).slice(2),
    tenantId: 't1',
    ownerId: 'u1',
    itemType: 'task',
    itemData: {},
    status: 'pending',
    createdAt: '2026-08-09T10:00:00Z',
    ...overrides,
  }
}

describe('groupByEntity（确认单：按 项目/线索/客户 聚合）', () => {
  it('同一项目的多次拜访合并为一单', () => {
    const items = [
      makeItem({ projectId: 'p1', visitId: 'v1', context: { companyName: '华科', projectName: '智慧教室' } }),
      makeItem({ projectId: 'p1', visitId: 'v2', context: { companyName: '华科', projectName: '智慧教室' } }),
      makeItem({ projectId: 'p2', visitId: 'v3', context: { companyName: '武大', projectName: '实验室' } }),
    ]
    const groups = groupByEntity(items)
    expect(groups).toHaveLength(2)
    const p1 = groups.find((g) => g.key === 'project:p1')!
    expect(p1.kind).toBe('project')
    expect(p1.items).toHaveLength(2)
    expect(p1.title).toBe('华科 · 智慧教室')
    expect(p1.subtitle).toContain('涉及 2 次拜访')
  })

  it('无项目时按线索聚合，标题带「线索：」', () => {
    const items = [
      makeItem({ visitId: 'v1', context: { companyName: '华科', leadId: 'l1', leadName: '信息化改造意向' } }),
    ]
    const groups = groupByEntity(items)
    expect(groups[0].kind).toBe('lead')
    expect(groups[0].title).toBe('华科 · 线索：信息化改造意向')
  })

  it('无项目无线索时按客户聚合，再兜底「其他来源」', () => {
    const byCompany = groupByEntity([makeItem({ context: { companyId: 'c1', companyName: '华科' } })])
    expect(byCompany[0].kind).toBe('company')
    expect(byCompany[0].title).toBe('华科')
    const other = groupByEntity([makeItem({})])
    expect(other[0].kind).toBe('other')
    expect(other[0].title).toBe('其他来源')
  })

  it('组间按组内最新创建时间倒序；空数组返回空', () => {
    const items = [
      makeItem({ projectId: 'old', createdAt: '2026-08-01T10:00:00Z' }),
      makeItem({ projectId: 'new', createdAt: '2026-08-09T10:00:00Z' }),
    ]
    const groups = groupByEntity(items)
    expect(groups[0].key).toBe('project:new')
    expect(groupByEntity([])).toEqual([])
  })

  it('entityKindLabel 人读标签', () => {
    expect(entityKindLabel('project')).toBe('项目')
    expect(entityKindLabel('lead')).toBe('线索')
  })
})

describe('describeItem（人读化描述，按写入端真实结构）', () => {
  it('task：title 为主标题，截止/优先级为字段，微调写回 title', () => {
    const desc = describeItem(
      makeItem({
        itemType: 'task',
        itemData: { title: '提交方案初稿', priority: 'HIGH', deadline: '2026-08-15T00:00:00Z' },
      }),
    )
    expect(desc.headline).toBe('提交方案初稿')
    expect(desc.fields.map((f) => f.label)).toEqual(['截止', '优先级'])
    expect(desc.fields[1].value).toBe('高')
    expect(desc.consequence).toContain('跟进任务')
    expect(desc.modifiable).toBe(true)
    expect(desc.modifyKey).toBe('title')
  })

  it('budget_signal：content 为主标题，微调写回 content', () => {
    const desc = describeItem(makeItem({ itemType: 'budget_signal', itemData: { content: '预算约80万' } }))
    expect(desc.headline).toBe('预算约80万')
    expect(desc.modifyKey).toBe('content')
    expect(desc.consequence).toContain('预算信息')
  })

  it('key_request / competitor_mention：content 为主标题', () => {
    expect(describeItem(makeItem({ itemType: 'key_request', itemData: { content: '要求支持国产化' } })).headline).toBe('要求支持国产化')
    expect(describeItem(makeItem({ itemType: 'competitor_mention', itemData: { content: '希沃报价低10%' } })).headline).toBe('希沃报价低10%')
  })

  it('decision_chain：列出决策人名单，不支持文本微调', () => {
    const desc = describeItem(
      makeItem({
        itemType: 'decision_chain',
        itemData: { chain: [{ name: '王处长', role: '决策者', attitude: '支持' }, { name: '李老师', role: '使用者' }] },
      }),
    )
    expect(desc.headline).toBe('识别到 2 位决策相关人')
    expect(desc.fields).toHaveLength(2)
    expect(desc.fields[0]).toEqual({ label: '决策者', value: '王处长（态度：支持）' })
    expect(desc.modifiable).toBe(false)
    expect(desc.modifyKey).toBeNull()
  })

  it('decision_chain：有 insight 时附在人员行内', () => {
    const desc = describeItem(
      makeItem({
        itemType: 'decision_chain',
        itemData: { chain: [{ name: '王校长', role: '最终决策者', attitude: '积极支持', insight: '倾向我方方案' }] },
      }),
    )
    expect(desc.fields[0].value).toBe('王校长（态度：积极支持） — 倾向我方方案')
  })

  it('未知类型兜底 JSON', () => {
    const desc = describeItem(makeItem({ itemType: 'unknown_type', itemData: { foo: 'bar' } }))
    expect(desc.headline).toContain('foo')
  })
})

describe('buildVisitDigest / groupVisitBlocks（V6.2 摘要级确认）', () => {
  it('把一次拜访的任务/预算/决策链拼成一段连贯的话', () => {
    const items = [
      makeItem({ itemType: 'task', itemData: { title: '提交方案初稿', deadline: '2026-08-15T02:00:00.000Z' } }),
      makeItem({ itemType: 'task', itemData: { title: '约王校长复盘' } }),
      makeItem({ itemType: 'budget_signal', itemData: { content: '约80万' } }),
      makeItem({ itemType: 'decision_chain', itemData: { chain: [{ name: '王校长', role: '最终决策者' }] } }),
      // auto 类型不进摘要
      makeItem({ itemType: 'key_request', itemData: { content: '国产化' } }),
    ]
    const digest = buildVisitDigest(items)
    expect(digest).toContain('接下来要做：提交方案初稿（截止')
    expect(digest).toContain('约王校长复盘')
    expect(digest).toContain('客户透露预算：约80万')
    expect(digest).toContain('决策相关人：王校长（最终决策者）')
    expect(digest).not.toContain('国产化')
    expect(digest.endsWith('。')).toBe(true)
  })

  it('空数组返回空串', () => {
    expect(buildVisitDigest([])).toBe('')
  })

  it('groupVisitBlocks 按拜访分块并生成摘要与副标题', () => {
    const items = [
      makeItem({
        visitId: 'v1',
        itemData: { title: '任务A' },
        context: { visitTime: '2026-08-09T10:00:00Z', rawInputType: 'recap', contactName: '王校长' },
      }),
      makeItem({ visitId: 'v1', itemType: 'budget_signal', itemData: { content: '80万' } }),
      makeItem({ visitId: 'v2', itemData: { title: '任务B' } }),
    ]
    const blocks = groupVisitBlocks(items)
    expect(blocks).toHaveLength(2)
    const v1 = blocks.find((b) => b.visitId === 'v1')!
    expect(v1.items).toHaveLength(2)
    expect(v1.digest).toContain('任务A')
    expect(v1.digest).toContain('80万')
    expect(v1.subtitle).toContain('个人复盘')
    expect(v1.subtitle).toContain('王校长')
  })
})

describe('buildChecklistRow（表单式确认的勾选行）', () => {
  it('task：标题为主文本，截止/优先级为元信息', () => {
    const row = buildChecklistRow(
      makeItem({ itemType: 'task', itemData: { title: '提交方案初稿', priority: 'HIGH', deadline: '2026-08-15T02:00:00.000Z' } }),
    )
    expect(row.text).toBe('提交方案初稿')
    expect(row.meta).toContain('截止')
    expect(row.meta).toContain('优先级高')
  })

  it('decision_chain：人名（角色）顿号连接 + 人数', () => {
    const row = buildChecklistRow(
      makeItem({ itemType: 'decision_chain', itemData: { chain: [{ name: '王校长', role: '最终决策者' }, { name: '李主任', role: '技术评估者' }] } }),
    )
    expect(row.text).toBe('王校长（最终决策者）、李主任（技术评估者）')
    expect(row.meta).toBe('2 人')
  })

  it('content 系类型：直接取 content', () => {
    expect(buildChecklistRow(makeItem({ itemType: 'budget_signal', itemData: { content: '约80万' } })).text).toBe('约80万')
    expect(buildChecklistRow(makeItem({ itemType: 'key_request', itemData: { content: '国产化' } })).text).toBe('国产化')
  })
})

describe('buildReviewPrompt（引导式判断题文案）', () => {
  it('task：说明要跟进什么 + 问是否加入任务清单', () => {
    const p = buildReviewPrompt(
      makeItem({ itemType: 'task', itemData: { title: '提交方案初稿', deadline: '2026-08-15T02:00:00.000Z' } }),
    )
    expect(p.statement).toContain('需要跟进：提交方案初稿')
    expect(p.statement).toContain('截止')
    expect(p.question).toBe('要加入你的任务清单吗？')
    expect(p.targetLabel).toBe('任务列表')
  })

  it('budget_signal：问"属实吗"并说明记入项目预算', () => {
    const p = buildReviewPrompt(makeItem({ itemType: 'budget_signal', itemData: { content: '约80万' } }))
    expect(p.statement).toBe('客户透露了预算信息：约80万')
    expect(p.question).toContain('属实')
  })

  it('key_request / competitor_mention：各自判断题', () => {
    expect(buildReviewPrompt(makeItem({ itemType: 'key_request', itemData: { content: 'x' } })).question).toContain('真实诉求')
    expect(buildReviewPrompt(makeItem({ itemType: 'competitor_mention', itemData: { content: '希沃' } })).statement).toContain('希沃')
  })

  it('decision_chain：列出人名，问人员角色是否属实', () => {
    const p = buildReviewPrompt(
      makeItem({
        itemType: 'decision_chain',
        itemData: { chain: [{ name: '王校长' }, { name: '李主任' }] },
      }),
    )
    expect(p.statement).toBe('识别到 2 位决策相关人：王校长、李主任')
    expect(p.question).toContain('属实')
  })
})

describe('buildFormSpec（确认单表单：与手工录入同字段口径）', () => {
  it('task → 任务列表：任务标题/优先级/截止日期', () => {
    const spec = buildFormSpec(
      makeItem({
        itemType: 'task',
        itemData: { title: '提交方案初稿', priority: 'HIGH', deadline: '2026-08-15T02:00:00.000Z' },
      }),
    )
    expect(spec.targetLabel).toBe('任务列表')
    expect(spec.readonly).toBe(false)
    expect(spec.fields.map((f) => f.label)).toEqual(['任务标题', '优先级', '截止日期'])
    expect(spec.fields[0].value).toBe('提交方案初稿')
    expect(spec.fields[1].value).toBe('HIGH')
    expect(spec.fields[2].inputType).toBe('datetime')
    expect(spec.fields[2].value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('budget_signal → 项目档案 · 财务信息 · 预算金额', () => {
    const spec = buildFormSpec(makeItem({ itemType: 'budget_signal', itemData: { content: '预算约80万' } }))
    expect(spec.targetLabel).toBe('项目档案 · 财务信息 · 预算金额')
    expect(spec.fields).toEqual([{ key: 'content', label: '预算金额', inputType: 'text', value: '预算约80万' }])
  })

  it('key_request / competitor_mention → 痛点列表 / 竞品', () => {
    expect(buildFormSpec(makeItem({ itemType: 'key_request', itemData: { content: 'x' } })).targetLabel).toBe(
      '项目档案 · 人文信息 · 痛点列表',
    )
    expect(buildFormSpec(makeItem({ itemType: 'competitor_mention', itemData: { content: 'x' } })).targetLabel).toBe(
      '项目档案 · 商务信息 · 竞品',
    )
  })

  it('decision_chain → 决策地图：只读表格行（姓名/角色/态度/洞察）', () => {
    const spec = buildFormSpec(
      makeItem({
        itemType: 'decision_chain',
        itemData: { chain: [{ name: '王校长', role: '最终决策者', attitude: '积极支持', insight: '倾向我方' }] },
      }),
    )
    expect(spec.targetLabel).toBe('项目档案 · 决策地图')
    expect(spec.readonly).toBe(true)
    expect(spec.tableRows).toEqual([{ name: '王校长', role: '最终决策者', attitude: '积极支持', insight: '倾向我方' }])
  })
})

describe('summarizeItem（兼容旧引用 = describeItem.headline）', () => {
  it('task 取 title', () => {
    expect(summarizeItem(makeItem({ itemType: 'task', itemData: { title: '提交方案初稿' } }))).toBe('提交方案初稿')
  })
})

describe('extractEvidence（证据锚定展示）', () => {
  it('提取 evidence 字符串', () => {
    expect(extractEvidence(makeItem({ itemData: { evidence: '预算约80万' } }))).toBe('预算约80万')
  })

  it('无 evidence 或空白返回 null', () => {
    expect(extractEvidence(makeItem({ itemData: {} }))).toBeNull()
    expect(extractEvidence(makeItem({ itemData: { evidence: '  ' } }))).toBeNull()
  })
})
