import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.js'

export interface SectionCardProps {
  /** 区块标（14/700）；可传 ReactNode 带计数徽章 */
  title?: ReactNode
  /** 区块副语（右对齐补充说明也可放 actions） */
  description?: ReactNode
  /** 右上操作位：按钮 / 链接 / 计数 */
  actions?: ReactNode
  /** 标题前置图标 */
  icon?: LucideIcon
  children: ReactNode
  /** 内容是否吃默认内边距（divide-y 列表类传 false 自己控制行距）；默认 true */
  padded?: boolean
  /** 锚点/滚动定位用 */
  id?: string
  contentClassName?: string
  className?: string
}

/**
 * 统一区块卡（issue #36 3.3-7）：标题行 + 右上动作 + 内容槽。
 * 圆角/阴影走 tokens v2 度量（rounded-card + shadow-card），
 * 取代各页手写的 `rounded-2xl border border-border bg-surface p-6`。
 */
export function SectionCard({
  title,
  description,
  actions,
  icon: Icon,
  children,
  padded = true,
  id,
  contentClassName,
  className,
}: SectionCardProps) {
  const hasHeader = title !== undefined || !!actions
  return (
    <section id={id} className={cn('rounded-card border border-border bg-surface shadow-card', className)}>
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon size={15} className="shrink-0 text-text-tertiary" aria-hidden />}
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold leading-5 text-text-primary">{title}</h3>
              {description && <p className="mt-0.5 truncate text-xs text-text-tertiary">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && 'px-5 pb-5', padded && !hasHeader && 'pt-5', contentClassName)}>{children}</div>
    </section>
  )
}
