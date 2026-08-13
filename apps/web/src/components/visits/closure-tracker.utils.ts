import type { VisitClosure } from '../../hooks/use-visit-closure.js'

/** 闭环向导的纯逻辑（从组件文件抽出，满足 react-refresh 单导出约束） */

export interface ClosureNodeState {
  key: keyof Pick<
    VisitClosure,
    'hasPreparation' | 'hasRecording' | 'hasSummary' | 'hasAiAnalysis' | 'hasFollowUp' | 'hasConfirmation'
  >
  label: string
  hint: string
  done: boolean
}

export const NODE_META: Array<{ key: ClosureNodeState['key']; label: string; hint: string }> = [
  { key: 'hasPreparation', label: '准备', hint: 'AI 拜访准备素材已生成' },
  { key: 'hasRecording', label: '记录', hint: '有录音或原始输入（速记/转写）' },
  { key: 'hasSummary', label: '摘要', hint: '拜访摘要已生成' },
  { key: 'hasAiAnalysis', label: 'AI分析', hint: 'AI 复盘已完成' },
  { key: 'hasFollowUp', label: '跟进', hint: '有下一步行动或待办' },
  { key: 'hasConfirmation', label: '确认', hint: 'AI 提取产物已全部人工确认' },
]

export function deriveNodeStates(closure: VisitClosure): ClosureNodeState[] {
  return NODE_META.map((m) => ({ key: m.key, label: m.label, hint: m.hint, done: !!closure[m.key] }))
}

export const BEHAVIOR_DIM_LABELS: Record<string, { label: string; max: number }> = {
  preparation: { label: '拜访准备', max: 15 },
  rawDocumentation: { label: '原始记录', max: 20 },
  followUp: { label: '跟进落实', max: 15 },
  progression: { label: '推进成果', max: 10 },
}

export const RUBRIC_WEIGHTED_MAX = 40

export function behaviorScoreOf(closure: VisitClosure): number {
  const f = closure.qualityFactors || {}
  return (
    (f.preparation || 0) + (f.rawDocumentation || 0) + (f.followUp || 0) + (f.progression || 0)
  )
}
