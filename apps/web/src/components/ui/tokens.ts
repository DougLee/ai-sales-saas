/**
 * tokens v2 的 JS 侧读取口（issue #36）：
 * recharts 等无法消费 class 的场景用 cssColor() 取当前值；
 * 组件内请继续用语义 class（bg-funnel-nurture 等）。
 * 注意：明暗切换后需让消费方重渲（如 useTheme 的 isDark 入依赖）才能取到新档。
 */
export function cssColor(varName: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
}

/** 漏斗三段色 CSS 变量名 */
export const FUNNEL_COLOR_VARS = {
  nurture: '--color-funnel-nurture',
  negotiate: '--color-funnel-negotiate',
  close: '--color-funnel-close',
} as const

export type FunnelSegment = keyof typeof FUNNEL_COLOR_VARS

/**
 * 里程碑（0-8）→ 漏斗三段：M0-M3 育单 / M4-M6 谈单 / M7-M8 成单。
 * 颜色即阶段——看板列、推进卡进度条、战役卡微条、报表漏斗图共用此判定。
 */
export function funnelSegmentOfMilestone(milestone: number): FunnelSegment {
  if (milestone >= 7) return 'close'
  if (milestone >= 4) return 'negotiate'
  return 'nurture'
}
