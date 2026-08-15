/**
 * UI 统一设计系统（issue #36）：状态胶囊
 * 业务状态 → 语义色映射内聚于此，页面禁止自制 pill
 * 三套口径：
 *  - 通用状态（进行中/成功/警告/危险/中性/信息）
 *  - 漏斗三段（nurture 育单 M0-M3 / negotiate 谈单 M4-M6 / close 成单 M7-M8）
 *  - 验证水位（single 单源 / cross 交叉 / final 坐实 / manual 人工）——对接 #35 推进卡 v2
 */

export type PillTone =
  | 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'info'
  | 'nurture' | 'negotiate' | 'close'
  | 'level-single' | 'level-cross' | 'level-final' | 'level-manual'

const TONE_CLASS: Record<PillTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-surface-elevated text-text-secondary',
  info: 'bg-info/10 text-info',
  nurture: 'bg-nurture/10 text-nurture',
  negotiate: 'bg-negotiate/10 text-negotiate',
  close: 'bg-close/10 text-close',
  'level-single': 'bg-level-single/10 text-level-single',
  'level-cross': 'bg-level-cross/10 text-level-cross',
  'level-final': 'bg-level-final/10 text-level-final',
  'level-manual': 'bg-level-manual/10 text-level-manual',
}

interface StatusPillProps {
  tone: PillTone
  /** 是否带色点（状态类默认带，阶段/水位类默认不带） */
  dot?: boolean
  children: React.ReactNode
  className?: string
}

export function StatusPill({ tone, dot, children, className = '' }: StatusPillProps) {
  const showDot = dot ?? ['primary', 'success', 'warning', 'danger', 'info'].includes(tone)
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2.5 text-[11px] font-semibold ${TONE_CLASS[tone]} ${className}`}
    >
      {showDot && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/** 里程碑 → 三段色便捷映射（M0-M8） */
export function milestoneTone(milestone: number): PillTone {
  if (milestone >= 7) return 'close'
  if (milestone >= 4) return 'negotiate'
  return 'nurture'
}
