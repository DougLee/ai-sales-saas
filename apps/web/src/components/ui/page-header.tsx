import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.js'

export interface PageHeaderProps {
  /** 页面主标（20/600，一页唯一 h1） */
  title: string
  /** 主标右侧徽章（如「3 条已逾期」「L1·机会信号层」），建议传 StatusPill */
  badge?: ReactNode
  /** 副语：一句话说明本页用途（13/400 辅助色） */
  subtitle?: string
  /** 行动区：右侧主/次行动（一屏一个 primary，其余描边或灰底） */
  actions?: ReactNode
  /** 第二行插槽：筛选栏 / 页签 / 搜索等 */
  children?: ReactNode
  className?: string
}

/**
 * 统一页头四槽（issue #36 P1）：页标 + 徽章 + 副语 + 行动区。
 * 六大模块同构的锚点件——换页时页头永远长一样，消灭 h1/h2 与字号混用。
 */
export function PageHeader({ title, badge, subtitle, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="mt-0.5 text-sm text-text-tertiary">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
