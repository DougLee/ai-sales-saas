import { CheckCircle2, ClipboardList, Mic, FileText, Sparkles, CalendarClock, UserCheck, RefreshCw } from 'lucide-react'
import type { VisitClosure } from '../../hooks/use-visit-closure.js'
import {
  deriveNodeStates,
  BEHAVIOR_DIM_LABELS,
  RUBRIC_WEIGHTED_MAX,
  behaviorScoreOf,
  type ClosureNodeState,
} from './closure-tracker.utils.js'

/**
 * 闭环向导（V6.1 §5.3）：拜访六节点进度可视化 + 双轨评分构成
 *
 * 六节点：准备 → 记录 → 摘要 → AI分析 → 跟进 → 确认
 * 评分构成透明：行为分(0-60) 四维 + rubric 折算分(0-40)
 */

const NODE_ICONS = {
  hasPreparation: ClipboardList,
  hasRecording: Mic,
  hasSummary: FileText,
  hasAiAnalysis: Sparkles,
  hasFollowUp: CalendarClock,
  hasConfirmation: UserCheck,
} as const

export default function ClosureTracker({
  closure,
  onRefresh,
  refreshing,
  actionableNodes,
  onNodeAction,
}: {
  closure: VisitClosure
  onRefresh?: () => void
  refreshing?: boolean
  /** 未完成时可点击引导的节点（如 AI分析→触发复盘、确认→前往收件箱） */
  actionableNodes?: ClosureNodeState['key'][]
  onNodeAction?: (key: ClosureNodeState['key']) => void
}) {
  const nodes = deriveNodeStates(closure)
  const doneCount = nodes.filter((n) => n.done).length
  const factors = closure.qualityFactors || {}
  const behavior = behaviorScoreOf(closure)
  const rubricWeighted = factors.rubricWeighted || 0

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">
          闭环进度
          <span className="ml-2 text-xs text-text-tertiary">{doneCount}/6</span>
        </h4>
        <div className="flex items-center gap-2">
          {closure.closedAt && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              已闭环 {new Date(closure.closedAt).toLocaleDateString('zh-CN')}
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="刷新闭环状态"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* 六节点 */}
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {nodes.map((node) => {
          const Icon = NODE_ICONS[node.key]
          const actionable = !node.done && !!actionableNodes?.includes(node.key) && !!onNodeAction
          const cls = `flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center ${
            node.done ? 'bg-success/10' : 'bg-surface-elevated'
          } ${actionable ? 'cursor-pointer ring-1 ring-primary/30 hover:bg-primary/10 hover:ring-primary' : ''}`
          const body = (
            <>
              {node.done ? (
                <CheckCircle2 size={16} className="text-success" />
              ) : (
                <Icon size={16} className={actionable ? 'text-primary' : 'text-text-tertiary'} />
              )}
              <span className={`text-[10px] font-medium ${node.done ? 'text-success' : actionable ? 'text-primary' : 'text-text-tertiary'}`}>
                {node.label}
              </span>
            </>
          )
          return actionable ? (
            <button
              key={node.key}
              type="button"
              onClick={() => onNodeAction!(node.key)}
              title={`${node.hint}（点击前往处理）`}
              className={cls}
            >
              {body}
            </button>
          ) : (
            <div key={node.key} title={node.hint} className={cls}>
              {body}
            </div>
          )
        })}
      </div>

      {/* 评分构成（双轨透明） */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-text-tertiary">质量分</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-text-primary">{closure.qualityScore ?? 0}</span>
            <span className="text-xs text-text-tertiary">/ 100</span>
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          {Object.entries(BEHAVIOR_DIM_LABELS).map(([key, meta]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">{meta.label}</span>
              <span className={`text-xs font-medium ${(factors[key as keyof typeof factors] ?? 0) > 0 ? 'text-text-primary' : 'text-text-tertiary'}`}>
                {factors[key as keyof typeof factors] ?? 0}/{meta.max}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-dashed border-border pt-1.5">
            <span className="text-xs text-text-secondary">
              信息增量（AI 评分{closure.rubricScore != null ? ` ${closure.rubricScore}/100` : ' 未评'}）
            </span>
            <span className={`text-xs font-medium ${rubricWeighted > 0 ? 'text-secondary' : 'text-text-tertiary'}`}>
              {rubricWeighted}/{RUBRIC_WEIGHTED_MAX}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-text-tertiary">
            <span>行为分 {behavior}/60 + 质量分 {rubricWeighted}/40</span>
            {closure.spotChecked && closure.spotCheckScore != null && (
              <span title="管理者抽检分（与 AI 评分同量纲 0-100）">抽检 {closure.spotCheckScore}</span>
            )}
          </div>
        </div>
      </div>

      {!closure.closedAt && doneCount < 6 && (
        <p className="mt-3 text-[11px] text-text-tertiary">
          还差 {6 - doneCount} 个节点：{nodes.filter((n) => !n.done).map((n) => n.label).join('、')}
        </p>
      )}
    </div>
  )
}
