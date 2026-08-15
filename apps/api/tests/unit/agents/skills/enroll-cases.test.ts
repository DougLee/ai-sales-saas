import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveEnrollTargets } from '../../../../src/agents/skills/crm/customer-enroll.util.js'

/**
 * 语料库数据驱动测试（#24 棘轮）：
 * 新增语料只改 tests/fixtures/enroll-cases.json，不改本文件。
 * 语料跑的是正则守卫路径（LLM 主路径在 customer-enroll.test.ts 里以 mock 方式覆盖）。
 */
const corpus = JSON.parse(
  readFileSync(join(__dirname, '../../../fixtures/enroll-cases.json'), 'utf-8'),
) as {
  cases: Array<{
    name: string
    message: string
    candidates: string[]
    expectNames?: string[]
    expectEmpty?: boolean
  }>
}

describe('enroll 解析语料库（#24）', () => {
  for (const c of corpus.cases) {
    it(c.name, () => {
      const candidates = c.candidates.map((name) => ({ name }))
      const { targets } = resolveEnrollTargets(c.message, candidates)
      if (c.expectEmpty) {
        expect(targets).toHaveLength(0)
        return
      }
      expect(targets.map((t) => t.name)).toEqual(c.expectNames)
    })
  }
})
