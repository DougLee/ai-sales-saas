import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-elevated': 'var(--color-surface-elevated)',
        border: 'var(--color-border)',
        'border-subtle': 'var(--color-border-subtle)',
        /* 语义色走 CSS 变量：浅色档满足文字对比度 AA，暗色档亮色系（审计 #12） */
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'primary-muted': 'rgba(10,132,255,0.12)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        info: 'var(--color-info)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-tertiary': 'var(--color-text-tertiary)',
        /* UI 统一设计系统 Tokens v2（issue #36）：第二/三色轴走 CSS 变量，明暗双档 */
        /* 漏斗三段色：颜色即阶段（育单蓝 / 谈单紫 / 成单绿） */
        nurture: 'var(--color-funnel-nurture)',
        negotiate: 'var(--color-funnel-negotiate)',
        close: 'var(--color-funnel-close)',
        /* 验证水位色：single 橙 / cross 青 / final 绿 / manual 紫 */
        'level-single': 'var(--color-level-single)',
        'level-cross': 'var(--color-level-cross)',
        'level-final': 'var(--color-level-final)',
        'level-manual': 'var(--color-level-manual)',
        /* 紧迫度 */
        'urgency-high': 'var(--color-urgency-high)',
        'urgency-mid': 'var(--color-urgency-mid)',
        'urgency-low': 'var(--color-urgency-low)',
      },
      keyframes: {
        /* 替代未安装的 tailwindcss-animate（审计 #12 死类）：右侧滑入 */
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(1.5rem)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        /* Stage 居中舞台进入（issue #37）：轻上浮 + 微缩放 */
        'stage-in': {
          from: { opacity: '0', transform: 'translateY(1.25rem) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
        'stage-in': 'stage-in 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      boxShadow: {
        glow: '0 0 20px rgba(10,132,255,0.15)',
        /* Tokens v2 度量：卡片常态 / 悬浮抬升（issue #36） */
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        inner: 'var(--radius-inner)',
      },
    },
  },
  plugins: [],
} satisfies Config
