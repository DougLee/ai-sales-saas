import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react'

/**
 * 批量操作条（issue #41 B2）：勾选任务后浮出。
 * 批量完成 / 批量取消（均由调用方配 confirm），清积压的效率底线。
 */
export function TaskBatchBar({
  count,
  busy,
  onComplete,
  onCancel,
  onClear,
}: {
  count: number
  busy: boolean
  onComplete: () => void
  onCancel: () => void
  onClear: () => void
}) {
  if (count === 0) return null
  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-3 shadow-lift"
      data-testid="task-batch-bar"
      role="toolbar"
      aria-label="批量操作"
    >
      <span className="text-sm font-medium text-text-primary">
        已选 <span className="tabular-nums text-primary">{count}</span> 项
      </span>
      <span className="h-5 w-px bg-border" aria-hidden />
      <button
        type="button"
        onClick={onComplete}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-xl bg-success px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        批量完成
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-xl border border-danger/40 px-3.5 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
      >
        <XCircle size={14} />
        批量取消
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        aria-label="取消选择"
        className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary disabled:opacity-50"
      >
        <X size={14} />
      </button>
    </div>
  )
}
