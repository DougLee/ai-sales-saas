import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.js'

export type KpiTone =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'funnel-nurture'
  | 'funnel-negotiate'
  | 'funnel-close'

const TONE_TEXT: Record<KpiTone, string> = {
  default: 'text-text-primary',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  'funnel-nurture': 'text-funnel-nurture-deep',
  'funnel-negotiate': 'text-funnel-negotiate-deep',
  'funnel-close': 'text-funnel-close-deep',
}

const TONE_ICON_BG: Record<KpiTone, string> = {
  default: 'bg-surface-elevated',
  primary: 'bg-primary/10',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  danger: 'bg-danger/10',
  info: 'bg-info/10',
  'funnel-nurture': 'bg-funnel-nurture/10',
  'funnel-negotiate': 'bg-funnel-negotiate/10',
  'funnel-close': 'bg-funnel-close/10',
}

export interface KpiTileProps {
  /** 指标名（如「活跃商机」） */
  label: string
  /** 指标值；数字自动走 tabular-nums（P3 精修批） */
  value: ReactNode
  /** 环比（百分比数值）：正绿负红 */
  delta?: number
  /** 环比说明（如「较上周」） */
  deltaLabel?: string
  icon?: LucideIcon
  tone?: KpiTone
  /** 值加载中：显示占位骨架 */
  loading?: boolean
  /** 卡底动作位（如「AI 复盘」链接） */
  footer?: ReactNode
  /** 传入即整卡可点，悬浮显示箭头 */
  onClick?: () => void
  /** sm 用于摘要条等紧凑场景 */
  size?: 'md' | 'sm'
  className?: string
}

/**
 * 统一指标卡（issue #36 3.3-2）：值 + 环比 + 标签。
 * 数字一律 tabular-nums；可点时整卡为按钮并给 hover 抬升反馈。
 */
export function KpiTile({
  label,
  value,
  delta,
  deltaLabel,
  icon: Icon,
  tone = 'default',
  loading = false,
  footer,
  onClick,
  size = 'md',
  className,
}: KpiTileProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div
              className={cn(
                'flex shrink-0 items-center justify-center rounded-inner',
                TONE_ICON_BG[tone],
                size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
              )}
            >
              <Icon size={size === 'sm' ? 14 : 18} className={TONE_TEXT[tone]} aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            {loading ? (
              <div className={cn('w-14 animate-pulse rounded-md bg-surface-elevated', size === 'sm' ? 'h-6' : 'h-8')} />
            ) : (
              <p
                className={cn(
                  'font-semibold tabular-nums leading-none',
                  TONE_TEXT[tone],
                  size === 'sm' ? 'text-xl' : 'text-2xl',
                )}
              >
                {value}
              </p>
            )}
            <p className="mt-1.5 truncate text-xs text-text-tertiary">{label}</p>
          </div>
        </div>
        {onClick && (
          <ChevronRight
            size={15}
            className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </div>
      {!loading && delta !== undefined && (
        <p className="mt-2 text-xs">
          <span className={cn('font-medium', delta >= 0 ? 'text-success' : 'text-danger')}>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%
          </span>
          {deltaLabel && <span className="ml-1 text-text-tertiary">{deltaLabel}</span>}
        </p>
      )}
      {footer}
    </>
  )

  const tileCls = cn(
    'rounded-card border border-border bg-surface px-4 text-left transition-all',
    size === 'sm' ? 'py-3' : 'py-3.5',
    onClick && 'group cursor-pointer hover:border-primary/30 hover:shadow-lift',
    className,
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={tileCls}>
        {body}
      </button>
    )
  }
  return <div className={tileCls}>{body}</div>
}
