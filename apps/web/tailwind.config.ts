import type { Config } from 'tailwindcss'

/**
 * 颜色统一走「RGB 通道变量 + <alpha-value>」：
 * - 基础类（bg-primary）与透明度修饰类（bg-primary/10）都能生成，
 *   修复此前 var() 直连时 /10 类被 Tailwind 静默丢弃的问题（tokens v2）
 * - hex 原值仍保留在 --color-x，供图表等 JS 侧读取
 */
const c = (name: string) => `rgb(var(${name}-rgb) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: c('--color-background'),
        surface: c('--color-surface'),
        'surface-elevated': c('--color-surface-elevated'),
        border: c('--color-border'),
        'border-subtle': c('--color-border-subtle'),
        /* 语义色走 CSS 变量：浅色档满足文字对比度 AA，暗色档亮色系（审计 #12） */
        primary: c('--color-primary'),
        'primary-hover': c('--color-primary-hover'),
        'primary-muted': 'rgba(10,132,255,0.12)',
        success: c('--color-success'),
        warning: c('--color-warning'),
        danger: c('--color-danger'),
        info: c('--color-info'),
        'text-primary': c('--color-text-primary'),
        'text-secondary': c('--color-text-secondary'),
        'text-tertiary': c('--color-text-tertiary'),
        /* 漏斗三段色（第二色轴）：浅档作底/图表，深档（-deep）作字色 */
        'funnel-nurture': c('--color-funnel-nurture'),
        'funnel-nurture-deep': c('--color-funnel-nurture-deep'),
        'funnel-negotiate': c('--color-funnel-negotiate'),
        'funnel-negotiate-deep': c('--color-funnel-negotiate-deep'),
        'funnel-close': c('--color-funnel-close'),
        'funnel-close-deep': c('--color-funnel-close-deep'),
        /* 验证水位色 */
        'level-manual': c('--color-level-manual'),
        'level-single': c('--color-level-single'),
        'level-cross': c('--color-level-cross'),
        'level-final': c('--color-level-final'),
        /* 紧迫度 */
        'urgency-high': c('--color-urgency-high'),
        'urgency-mid': c('--color-urgency-mid'),
        'urgency-low': c('--color-urgency-low'),
      },
      /* 度量 tokens（标注规范 3.2）：rounded-card / rounded-inner / rounded-pill */
      borderRadius: {
        card: 'var(--radius-card)',
        inner: 'var(--radius-inner)',
        pill: 'var(--radius-pill)',
      },
      keyframes: {
        /* 替代未安装的 tailwindcss-animate（审计 #12 死类）：右侧滑入 */
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(1.5rem)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        /* Stage 居中舞台进入（issue #40）：轻上浮 + 微缩放 */
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
        spring: 'var(--ease-spring)',
      },
      boxShadow: {
        glow: '0 0 20px rgba(10,132,255,0.15)',
        /* tokens v2：卡片常驻影 / 悬浮抬升影 */
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
      },
    },
  },
  plugins: [],
} satisfies Config
