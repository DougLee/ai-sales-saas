import type { LucideIcon } from 'lucide-react'
import { Inbox, Loader2, AlertCircle, RefreshCw } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/** 统一空状态：列表/卡片无数据时使用 */
export function EmptyState({
  icon: Icon = Inbox,
  title = '暂无数据',
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated">
        <Icon size={22} className="text-text-tertiary" />
      </div>
      <p className="mt-3 text-sm font-medium text-text-secondary">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-text-tertiary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** 统一加载态 */
export function LoadingState({ label = '加载中...', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <Loader2 size={22} className="animate-spin text-primary" />
      <p className="mt-3 text-sm text-text-tertiary">{label}</p>
    </div>
  )
}

/** 统一错误态，支持重试 */
export function ErrorState({
  message = '加载失败，请稍后重试',
  onRetry,
  className = '',
}: {
  message?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-danger/20 bg-danger/5 px-6 py-12 text-center ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
        <AlertCircle size={22} className="text-danger" />
      </div>
      <p className="mt-3 text-sm font-medium text-danger">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
        >
          <RefreshCw size={14} />
          重试
        </button>
      )}
    </div>
  )
}

/* ===== 状态五件套补充（UI 统一设计系统 issue #36）=====
   Empty/Loading/Error 已有；此处补骨架屏与表格骨架——
   列表/表格加载优先用骨架而非转圈，保持布局稳定 */

function ShimmerRow({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-elevated ${className}`} />
}

/** 统一骨架屏：卡片/区块加载占位 */
export function SkeletonState({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 px-1 py-4 ${className}`} aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <ShimmerRow className="h-9 w-9 !rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <ShimmerRow className={`h-3.5 ${i % 2 === 0 ? 'w-3/4' : 'w-[55%]'}`} />
            <ShimmerRow className="h-2.5 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 表格骨架：列数自适应（默认 5 列 × 6 行） */
export function TableSkeleton({ cols = 5, rows = 6, className = '' }: { cols?: number; rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2.5 py-4 ${className}`} aria-busy="true" aria-label="加载中">
      <ShimmerRow className="h-8 w-full !rounded-lg" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid items-center gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <ShimmerRow key={c} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  )
}

