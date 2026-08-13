import { describe, it, expect } from 'vitest'
import {
  enforceEvidenceAnchor,
  parseRubricResponse,
  buildRubricPrompt,
} from '../../../../src/crm/visits/rubric.service.js'

const RAW = '今天拜访了李主任，确认需求是智慧教室改造整体方案，预算约80万，下周三前提交方案初稿。'

describe('rubric.service（V6.1 §6.1 B 轨）', () => {
  describe('enforceEvidenceAnchor（evidence 必须锚定 rawInput 原文）', () => {
    it('evidence 为原文子串 → 保留分数', () => {
      const dims = enforceEvidenceAnchor(
        [{ name: '预算与流程', score: 18, evidence: '预算约80万' }],
        RAW,
      )
      expect(dims[0].score).toBe(18)
      expect(dims[0].evidenceValid).toBe(true)
    })

    it('evidence 非原文（LLM 脑补）→ 该维度清零', () => {
      const dims = enforceEvidenceAnchor(
        [{ name: '决策链信息', score: 20, evidence: '张副局长拍板支持' }],
        RAW,
      )
      expect(dims[0].score).toBe(0)
      expect(dims[0].evidenceValid).toBe(false)
    })

    it('给了分却没有 evidence → 清零（不符合 rubric 约定）', () => {
      const dims = enforceEvidenceAnchor([{ name: '竞争态势', score: 10 }], RAW)
      expect(dims[0].score).toBe(0)
      expect(dims[0].evidenceValid).toBe(false)
    })

    it('0 分无 evidence → 合法（记录中没有的维度）', () => {
      const dims = enforceEvidenceAnchor([{ name: '竞争态势', score: 0 }], RAW)
      expect(dims[0].score).toBe(0)
      expect(dims[0].evidenceValid).toBe(true)
    })

    it('分数 clamp 到维度上限', () => {
      const dims = enforceEvidenceAnchor(
        [{ name: '下一步承诺', score: 99, evidence: '下周三前提交方案初稿' }],
        RAW,
      )
      expect(dims[0].score).toBe(15) // 上限 15
    })

    it('空白差异不影响锚定（去空白比对）', () => {
      const dims = enforceEvidenceAnchor(
        [{ name: '需求与痛点', score: 20, evidence: '确认需求是 智慧教室改造 整体方案' }],
        RAW,
      )
      expect(dims[0].evidenceValid).toBe(true)
    })
  })

  describe('parseRubricResponse', () => {
    it('解析合法 JSON', () => {
      const parsed = parseRubricResponse(
        '{"dimensions":[{"name":"预算与流程","score":15,"evidence":"x"}],"total":15,"comment":"ok"}',
      )
      expect(parsed).not.toBeNull()
      expect(parsed!.total).toBe(15)
    })

    it('容忍 markdown 代码块包裹', () => {
      const parsed = parseRubricResponse('```json\n{"dimensions":[],"total":0,"comment":""}\n```')
      expect(parsed).not.toBeNull()
    })

    it('非法 JSON 返回 null（调用方降级）', () => {
      expect(parseRubricResponse('不是JSON')).toBeNull()
    })

    it('dimensions 非数组返回 null', () => {
      expect(parseRubricResponse('{"total":50}')).toBeNull()
    })
  })

  describe('buildRubricPrompt', () => {
    it('包含 5 个维度与红线说明', () => {
      const prompt = buildRubricPrompt(RAW, '上下文')
      for (const dim of ['决策链信息', '需求与痛点', '预算与流程', '竞争态势', '下一步承诺']) {
        expect(prompt).toContain(dim)
      }
      expect(prompt).toContain('evidence 必须引用原始记录')
      expect(prompt).toContain(RAW)
    })
  })
})
