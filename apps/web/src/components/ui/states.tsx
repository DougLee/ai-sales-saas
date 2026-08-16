import type { LucideIcon } from 'lucide-react'
import { Inbox, Loader2, AlertCircle, RefreshCw } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
  /** 紧凑档：区块卡内部的行间空态（去掉大留白，高度约 88px） */
  compact?: boolean
}

/** 统一空状态：列表/卡片无数据时使用（状态五件套之「空」） */
export function EmptyState({
  icon: Icon = Inbox,
  title = '暂无数据',
  description,
  action,
  className = '',
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-6 text-center ${
        compact ? 'py-6' : 'py-12'
      } ${className}`}
    >
      <div
        className={`flex items-center justify-center rounded-full bg-surface-elevated ${compact ? 'h-9 w-9' : 'h-12 w-12'}`}
      >
        <Icon size={compact ? 16 : 22} className="text-text-tertiary" />
      </div>
      <p className={`${compact ? 'mt-2 text-xs' : 'mt-3 text-sm'} font-medium text-text-secondary`}>{title}</p>
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
