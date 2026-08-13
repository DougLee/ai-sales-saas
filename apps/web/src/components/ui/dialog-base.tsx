import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// 模块级实例栈：只有最顶层 Dialog 响应 Esc/Tab 圈定，嵌套弹窗逐层关闭
const dialogStack: symbol[] = []
let zCounter = 0

interface DialogBaseProps {
  open: boolean
  onClose: () => void
  /** aria-label（弹窗没有可见标题时用） */
  label: string
  /** 点遮罩关闭，默认 true */
  closeOnOverlay?: boolean
  /** center=居中弹窗；right=右侧抽屉 */
  placement?: 'center' | 'right'
  panelClassName?: string
  panelStyle?: CSSProperties
  children: ReactNode
}

/**
 * Dialog 基座：Esc 关闭、遮罩关闭、焦点圈定、初始/返回焦点、背景滚动锁、z-index 栈。
 * Modal / Drawer / ConfirmDialog 全部收敛到这一层，不要在别处自造 fixed 遮罩。
 */
export default function DialogBase({
  open,
  onClose,
  label,
  closeOnOverlay = true,
  placement = 'center',
  panelClassName = '',
  panelStyle,
  children,
}: DialogBaseProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const zRef = useRef<number | null>(null)
  // onClose 放进 ref：调用方常传内联箭头函数，身份每次渲染都变，
  // 若作为 effect 依赖会导致每次击键都重跑初始化（焦点被抢走，输入框打不出字）
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  if (open && zRef.current === null) {
    zCounter += 1
    zRef.current = 50 + zCounter * 10
  }
  if (!open) {
    zRef.current = null
  }

  useEffect(() => {
    if (!open) return
    const id = Symbol('dialog')
    dialogStack.push(id)
    const panel = panelRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) || []).filter(
        (el) => el.getClientRects().length > 0,
      )

    // 初始焦点：第一个可聚焦元素，否则面板本身
    const first = focusables()[0]
    ;(first || panel)?.focus()

    const isTop = () => dialogStack[dialogStack.length - 1] === id

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTop()) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === firstEl || !panel.contains(active))) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && (active === lastEl || !panel.contains(active))) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      const idx = dialogStack.indexOf(id)
      if (idx >= 0) dialogStack.splice(idx, 1)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 flex ${placement === 'right' ? 'justify-end' : 'items-center justify-center p-4'}`}
      style={{ zIndex: zRef.current ?? 50 }}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative outline-none ${panelClassName}`}
        style={panelStyle}
      >
        {children}
      </div>
    </div>
  )
}
