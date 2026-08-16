import { cn } from '../../lib/utils.js'

export interface SkeletonRowProps {
  /** 行数，默认 1 */
  rows?: number
  /** 单行高度 class（默认 h-12 列表行） */
  rowClassName?: string
  className?: string
}

/** 骨架行（状态五件套之「加载」的列表形态）：代替转圈，加载时保住版式 */
export function SkeletonRow({ rows = 1, rowClassName = 'h-12', className }: SkeletonRowProps) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn('animate-pulse rounded-inner bg-surface-elevated', rowClassName)} />
      ))}
    </div>
  )
}
