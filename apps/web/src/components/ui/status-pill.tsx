import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.js'

/**
 * 语义色调全集：基础语义色 + 漏斗三段 + 验证水位 + 紧迫度（issue #36「一色一义」）。
 * 业务状态 → 语义色 的映射表内聚在各页面的 meta 里，颜色只在组件这一层收口。
 */
export type PillTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'funnel-nurture'
  | 'funnel-negotiate'
  | 'funnel-close'
  | 'level-manual'
  | 'level-single'
  | 'level-cross'
  | 'level-final'
  | 'urgency-high'
  | 'urgency-mid'
  | 'urgency-low'

const TONE_CLS: Record<PillTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  neutral: 'bg-text-tertiary/10 text-text-tertiary',
  /* 三段色浅档作 10% 底，深档作字色（双档均满足 AA） */
  'funnel-nurture': 'bg-funnel-nurture/10 text-funnel-nurture-deep',
  'funnel-negotiate': 'bg-funnel-negotiate/10 text-funnel-negotiate-deep',
  'funnel-close': 'bg-funnel-close/10 text-funnel-close-deep',
  'level-manual': 'bg-level-manual/10 text-level-manual',
  'level-single': 'bg-level-single/10 text-level-single',
  'level-cross': 'bg-level-cross/10 text-level-cross',
  'level-final': 'bg-level-final/10 text-level-final',
  'urgency-high': 'bg-urgency-high/10 text-urgency-high',
  'urgency-mid': 'bg-urgency-mid/10 text-urgency-mid',
  'urgency-low': 'bg-urgency-low/10 text-urgency-low',
}

export interface StatusPillProps {
  /** 语义色档；默认 neutral（灰） */
  tone?: PillTone
  /** 前置小图标（11px 行内） */
  icon?: LucideIcon
  /** 前置圆点：适合不需要图标的轻量状态 */
  dot?: boolean
  className?: string
  children: ReactNode
}

/**
 * 统一状态胶囊（标注规范 pill/badge 档）：
 * 语义色 10% 底 + 全色字，高 20px、字 11px/600、padding 2/8、圆角 pill。
 * 全站 pill 收敛到此件，消灭各页手写的 rounded-full 色串。
 */
export function StatusPill({ tone = 'neutral', icon: Icon, dot, className, children }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-pill px-2 text-[11px] font-semibold leading-none',
        TONE_CLS[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {Icon && <Icon size={11} className="shrink-0" aria-hidden />}
      {children}
    </span>
  )
}
