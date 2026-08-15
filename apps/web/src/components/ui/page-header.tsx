import type { LucideIcon } from 'lucide-react'

/**
 * UI 统一设计系统（issue #36）：统一页头
 * 六大业务模块同构——主标 20/600 + 层级徽章（L0/L1/L2，与漏斗层级同源）+ 副题 + 主行动区
 * 主行动区第一个按钮应为 primary 主行动（每屏唯一）；次行动用描边按钮
 */

export type FunnelLevel = 'L0' | 'L1' | 'L2'

const LEVEL_META: Record<FunnelLevel, { label: string; className: string }> = {
  L0: { label: 'L0 · 客户池层', className: 'bg-surface-elevated text-text-secondary' },
  L1: { label: 'L1 · 机会信号层', className: 'bg-primary/10 text-primary' },
  L2: { label: 'L2 · 立项推进层', className: 'bg-negotiate/10 text-negotiate' },
}

interface PageHeaderProps {
  /** 页面主标（20/600） */
  title: string
  /** 漏斗层级徽章：L0 客户池 / L1 线索 / L2 商机；非漏斗模块省略 */
  level?: FunnelLevel
  /** 副题一句话（12.5 灰） */
  description?: string
  /** 右侧行动区：第一个为主行动（primary 且每屏唯一） */
  actions?: React.ReactNode
  /** 可选主标图标 */
  icon?: LucideIcon
}

export function PageHeader({ title, level, description, actions, icon: Icon }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-text-primary">
          {Icon && <Icon size={20} className="text-text-tertiary" />}
          {title}
          {level && (
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${LEVEL_META[level].className}`}>
              {LEVEL_META[level].label}
            </span>
          )}
        </h2>
        {description && <p className="mt-0.5 text-[12.5px] text-text-tertiary">{description}</p>}
      </div>
      {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
    </div>
  )
}
