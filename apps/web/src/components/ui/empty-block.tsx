import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils.js'

export interface EmptyBlockProps {
  /** 折叠条标题（如「其余战线」「今日没有必须打响的战役」） */
  title: string
  /** 展开后的补充说明 */
  description?: ReactNode
  /** 展开后的内容（引导列表 / 空态说明） */
  children?: ReactNode
  icon?: LucideIcon
  /** 非受控默认展开态；默认收起 */
  defaultExpanded?: boolean
  /** 受控展开（传入即受控，配合 onToggle） */
  expanded?: boolean
  onToggle?: () => void
  className?: string
}

/**
 * 空模块折叠占位条（issue #36 状态五件套的轻量形态）：
 * 一行高的占位条，点击展开详情——用于「暂无数据但要保留模块存在感」的场景，
 * 区别于居中大空态 EmptyState。
 */
export function EmptyBlock({
  title,
  description,
  children,
  icon: Icon,
  defaultExpanded = false,
  expanded,
  onToggle,
  className,
}: EmptyBlockProps) {
  const [internalOpen, setInternalOpen] = useState(defaultExpanded)
  const open = expanded ?? internalOpen
  const toggle = () => (onToggle ? onToggle() : setInternalOpen((v) => !v))

  return (
    <div className={cn('rounded-card border border-border bg-surface', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-surface-elevated/50"
      >
        {Icon && <Icon size={15} className="shrink-0 text-text-tertiary" aria-hidden />}
        <span className="min-w-0 truncate text-sm font-medium text-text-secondary">{title}</span>
        <ChevronDown
          size={15}
          className={cn(
            'ml-auto shrink-0 text-text-tertiary transition-transform duration-200 ease-spring',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-border px-5 py-3 text-xs leading-relaxed text-text-tertiary">
          {description && <p>{description}</p>}
          {children}
        </div>
      )}
    </div>
  )
}
