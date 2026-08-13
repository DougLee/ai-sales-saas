import { describe, it, expect } from 'vitest'
import {
  getRawInput,
  computeClosureFlags,
  computeBehaviorScore,
} from '../../../../src/crm/visits/closure.service.js'

/**
 * V6.1 Phase 3 红线：
 * 1. getRawInput 不再回退到 summary（summary 是 AI 扩写产物）
 * 2. AI 扩写摘要的任何变化不影响行为分
 * 3. hasPreparation 只认 visit_prep 准备素材，不再从 summary 文本猜测
 */
describe('closure.service (Phase 3)', () => {
  describe('getRawInput', () => {
    it('rawInput 优先', () => {
      const raw = getRawInput({
        rawInput: '销售速记原文',
        rawInputType: 'recap',
        audioTranscript: '转写',
        summary: 'AI 扩写摘要',
      })
      expect(raw).toEqual({ text: '销售速记原文', type: 'recap' })
    })

    it('rawInput 缺失时回退 audioTranscript', () => {
      const raw = getRawInput({ audioTranscript: '转写原文', summary: 'AI 扩写摘要' })
      expect(raw).toEqual({ text: '转写原文', type: 'transcript' })
    })

    it('summary 不再是回退链的一环（Phase 3 移除）', () => {
      const raw = getRawInput({ summary: '只有 AI 扩写摘要，没有原始输入' })
      expect(raw).toEqual({ text: '', type: null })
    })

    it('全部为空返回空', () => {
      expect(getRawInput({})).toEqual({ text: '', type: null })
    })
  })

  describe('computeClosureFlags', () => {
    it('hasPreparation 认 attachments 里的 visit_prep 产物', () => {
      const flags = computeClosureFlags(
        { attachments: [{ type: 'visit_prep', content: { objective: 'x' } }] },
        true,
      )
      expect(flags.hasPreparation).toBe(true)
    })

    it('summary 含"准备"字样不再算 hasPreparation', () => {
      const flags = computeClosureFlags({ summary: '本次拜访准备充分，谈了需求与预算' }, true)
      expect(flags.hasPreparation).toBe(false)
    })

    it('hasRecording 认 audioUrl 或原始输入', () => {
      expect(computeClosureFlags({ audioUrl: 'http://x/y.mp3' }, true).hasRecording).toBe(true)
      expect(computeClosureFlags({ rawInput: '速记内容' }, true).hasRecording).toBe(true)
      expect(computeClosureFlags({ summary: '仅 AI 摘要' }, true).hasRecording).toBe(false)
    })

    it('hasConfirmation 由调用方传入（待确认队列推导）', () => {
      expect(computeClosureFlags({}, false).hasConfirmation).toBe(false)
      expect(computeClosureFlags({}, true).hasConfirmation).toBe(true)
    })
  })

  describe('computeBehaviorScore（A 轨红线）', () => {
    const baseVisit = {
      rawInput: '今天拜访了李主任，确认需求是智慧教室改造，预算约80万，方案下周提交，决策流程要上办公会，时间预计9月开学前',
      rawInputType: 'recap' as const,
      nextActionDeadline: new Date('2026-08-20'),
    }

    it('AI 扩写摘要的任何变化不影响行为分', () => {
      const flags = computeClosureFlags(baseVisit, true)
      const scoreA = computeBehaviorScore({ ...baseVisit, summary: 'AI 摘要版本一' }, flags)
      const scoreB = computeBehaviorScore({ ...baseVisit, summary: '完全不同的另一段 AI 扩写文字，随便多长' }, flags)
      const scoreC = computeBehaviorScore({ ...baseVisit, summary: null }, flags)
      expect(scoreA.behaviorScore).toBe(scoreB.behaviorScore)
      expect(scoreA.behaviorScore).toBe(scoreC.behaviorScore)
    })

    it('原始输入长度与关键词命中计分', () => {
      const flags = computeClosureFlags(baseVisit, true)
      const { behaviorScore, dimensions } = computeBehaviorScore(baseVisit, flags)
      // rawDocumentation: hasRecording 8 + len>=100 6 + len>=300 0 + 关键词 min(3, hits)
      expect(dimensions.rawDocumentation).toBeGreaterThanOrEqual(8 + 3)
      expect(dimensions.followUp).toBe(8 + 7) // hasFollowUp + hasConfirmation
      expect(behaviorScore).toBeLessThanOrEqual(60)
    })

    it('无原始输入时 rawDocumentation 只得 0（summary 不补位）', () => {
      const flags = computeClosureFlags({}, false)
      const { dimensions } = computeBehaviorScore(
        { summary: '一段很长很完整的 AI 扩写摘要，包含需求预算方案时间决策痛点下一步竞争所有关键词' },
        flags,
      )
      expect(dimensions.rawDocumentation).toBe(0)
    })
  })
})
