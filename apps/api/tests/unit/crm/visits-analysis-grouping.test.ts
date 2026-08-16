import { describe, it, expect, vi } from 'vitest'

// 纯函数单测：mock 掉控制器引到的重依赖（LLM/并发/服务），只验证 #42 聚类 payload 本身
vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('../../../src/config/model-provider.js', () => ({ createModel: vi.fn() }))
vi.mock('../../../src/infra/concurrency-limiter.js', () => ({ llmConcurrencyLimiter: { run: vi.fn() } }))
vi.mock('../../../src/crm/visits/visit-prep.service.js', () => ({ generatePrepMaterial: vi.fn() }))
vi.mock('../../../src/crm/confirmations/confirmations.service.js', () => ({ createAutoAppliedItem: vi.fn() }))
vi.mock('../../../src/lib/timeline.js', () => ({ recordTimelineEvent: vi.fn() }))

const { clusterNextActions, buildTaskPackageData, buildGroupItemData, freshGroupItems } = await import(
  '../../../src/crm/visits/visits.analysis.controller.js'
)

/**
 * #42 归类确认（生成侧）：
 * - nextActions ≤5→≤3 且按推动目的聚类（本批去重 + 与库内开放任务去重）
 * - N 条动作全部进 1 个"任务包"（itemType='task_package'，itemData={ actions }）
 * - painPoints / competitors N 条 → 1 条类级条目（itemData={ items }）
 */

describe('clusterNextActions（任务动作聚类：≤3 条）', () => {
  it('上限从 5 收紧到 3', () => {
    const raw = [
      '提交智慧教室方案初稿',
      '约王校长复盘预算口径',
      '向国资处申请招标参数',
      '同步产品同事确认国产化清单',
      '发送拜访感谢邮件',
      '更新决策链画像',
    ]
    expect(clusterNextActions(raw, [])).toHaveLength(3)
  })

  it('本批内换角度复述合并（留信息量更大的版本）', () => {
    const raw = ['提交方案初稿', '按时提交方案初稿，确保内容专业']
    const out = clusterNextActions(raw, [])
    expect(out).toEqual(['按时提交方案初稿，确保内容专业'])
  })

  it('与库内未完成任务相似的不再建议', () => {
    const out = clusterNextActions(['提交方案初稿', '约王校长复盘'], ['已提交方案初稿待反馈'])
    // "提交方案初稿"与库内开放任务相似 → 过滤；独立动作保留
    expect(out).toEqual(['约王校长复盘'])
  })

  it('聚类后再截断（去重优先于上限）', () => {
    const raw = ['推进合同签订', '推进合同签订事宜', '约见决策人', '整理会议纪要', '发送感谢邮件']
    const out = clusterNextActions(raw, [])
    expect(out.length).toBeLessThanOrEqual(3)
    expect(out[0]).toBe('推进合同签订事宜') // 同一事留更完整的表述
  })
})

describe('buildTaskPackageData（任务包 payload：1 包带步骤清单）', () => {
  it('主线标题=第一动作，步骤清单进 actions，content 供旧视图兜底', () => {
    const data = buildTaskPackageData(['提交方案初稿', '约王校长复盘'], new Date('2026-08-20T00:00:00.000Z'))
    expect(data.title).toBe('提交方案初稿')
    expect(data.content).toBe('提交方案初稿；约王校长复盘')
    expect(data.actions).toEqual([{ title: '提交方案初稿' }, { title: '约王校长复盘' }])
    expect(data.deadline).toBe('2026-08-20T00:00:00.000Z')
  })

  it('deadline 继承拜访的 nextActionDeadline；无则 +7 天', () => {
    const withDeadline = buildTaskPackageData(['动作'], new Date('2026-09-01T00:00:00.000Z'))
    expect(withDeadline.deadline).toBe('2026-09-01T00:00:00.000Z')

    const fallback = buildTaskPackageData(['动作'], null)
    const diffDays = (new Date(String(fallback.deadline)).getTime() - Date.now()) / 86400000
    expect(diffDays).toBeGreaterThan(6.9)
    expect(diffDays).toBeLessThan(7.1)
  })

  it('空动作兜底为主线标题占位，不产生空步骤', () => {
    const data = buildTaskPackageData(['', '  ', '唯一动作'], null)
    expect(data.actions).toEqual([{ title: '唯一动作' }])
    expect(data.title).toBe('唯一动作')
  })
})

describe('buildGroupItemData / freshGroupItems（类级批 payload）', () => {
  it('N 条 → { items } 批 payload，content 供旧视图兜底', () => {
    expect(buildGroupItemData(['设备老旧', '缺少预算'])).toEqual({
      content: '设备老旧；缺少预算',
      items: ['设备老旧', '缺少预算'],
    })
  })

  it('批内聚类：去空、trim、去已知（档案已有）、批内去重', () => {
    expect(freshGroupItems([' 设备老旧 ', '', '缺少预算', '设备老旧'], ['已有痛点'])).toEqual(['设备老旧', '缺少预算'])
    expect(freshGroupItems([], [])).toEqual([])
  })
})
