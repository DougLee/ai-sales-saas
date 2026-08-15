import { describe, it, expect } from 'vitest'
import { resolveEnrollTargets } from '../../../../src/agents/skills/crm/customer-enroll.util.js'

/**
 * 回归：2026-08-15 事故——"把上边提到的前三个客户入库"
 * 曾把「上边提到的前三个」当客户名建库，且序数正则不认"前N个"。
 */
const cands = [
  { name: '邯郸市中心医院', industry: '医疗' },
  { name: '河北工程大学', industry: '教育·高等院校' },
  { name: '邯郸学院', industry: '教育·高等院校' },
  { name: '邯郸职业技术学院', industry: '教育·职业院校' },
]

describe('resolveEnrollTargets 序数解析', () => {
  it('前三个 = 头 3 个候选（本次事故用例）', () => {
    const { targets } = resolveEnrollTargets('把上边提到的前三个客户入库', cands)
    expect(targets.map((t) => t.name)).toEqual(['邯郸市中心医院', '河北工程大学', '邯郸学院'])
    expect(targets.every((t) => t.origin === 'recommend')).toBe(true)
  })

  it('前3家（阿拉伯数字+量词家）同样生效', () => {
    const { targets } = resolveEnrollTargets('前3家入库', cands)
    expect(targets).toHaveLength(3)
  })

  it('第三个 = 第 3 个（单数）', () => {
    const { targets } = resolveEnrollTargets('把第三个入库', cands)
    expect(targets.map((t) => t.name)).toEqual(['邯郸学院'])
  })

  it('后两个 = 末 2 个', () => {
    const { targets } = resolveEnrollTargets('后两个入库', cands)
    expect(targets.map((t) => t.name)).toEqual(['邯郸学院', '邯郸职业技术学院'])
  })

  it('前五个超出候选数 → 不入库并说明', () => {
    const { targets, reason } = resolveEnrollTargets('前五个入库', cands)
    expect(targets).toHaveLength(0)
    expect(reason).toContain('只推荐了 4 个')
  })
})

describe('resolveEnrollTargets 垃圾名称守卫', () => {
  it('指示代词短语绝不当客户名（无候选时提示而非建库）', () => {
    const r1 = resolveEnrollTargets('把上边提到的入库', [])
    expect(r1.targets).toHaveLength(0)

    const r2 = resolveEnrollTargets('把前面几个入库', cands)
    // "前面几个" 命中"这几个"类全量？不含——应走序数失败或全量兜底，总之不允许出现垃圾名
    for (const t of r2.targets) {
      expect(isJunk(t.name)).toBe(false)
    }
  })

  it('自动/全部等动作碎片不当名称', () => {
    const { targets } = resolveEnrollTargets('把都自动入库', [])
    expect(targets.every((t) => !/自动|全部/.test(t.name))).toBe(true)
  })
})

describe('resolveEnrollTargets 正常路径回归', () => {
  it('第二个 = 第 2 个候选', () => {
    const { targets } = resolveEnrollTargets('把第二家入库', cands)
    expect(targets.map((t) => t.name)).toEqual(['河北工程大学'])
  })

  it('全部入库 = 所有候选', () => {
    const { targets } = resolveEnrollTargets('都入库', cands)
    expect(targets).toHaveLength(4)
  })

  it('引号名称优先进候选匹配，匹配不到才按新名直建', () => {
    const matched = resolveEnrollTargets('把「河北工程大学」入库', cands)
    expect(matched.targets[0]).toMatchObject({ name: '河北工程大学', origin: 'recommend' })

    const fresh = resolveEnrollTargets('把「郑州轻工业大学」入库', cands)
    expect(fresh.targets[0]).toMatchObject({ name: '郑州轻工业大学', origin: 'name' })
  })

  it('把XX公司入库（无引号）仍可直建', () => {
    const { targets } = resolveEnrollTargets('把开封大学入库', cands)
    expect(targets[0]).toMatchObject({ name: '开封大学', origin: 'name' })
  })
})

/** 与实现的守卫口径保持一致（测试内联复制，避免导出私有函数） */
function isJunk(name: string): boolean {
  return /(?:第|前|后)\s*[一二三四五六七八九十\d]+\s*[个条名家位所校位]?$/.test(name)
    || /^上边|^上面|^前面|^刚才|^之前|^上述|^前文/.test(name)
    || /提到|自动|全部|这些|几个/.test(name)
}
