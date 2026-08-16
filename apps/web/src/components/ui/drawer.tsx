import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import DialogBase from './dialog-base.js'

/**
 * 详情载体分档（issue #38 载体分层规范）：
 * - sm（D1 轻确认）：28rem，任务详情 / 确认单 / 简单查看
 * - md（D2 标准详情）：40rem，客户 / 线索 / 拜访 / 联系人详情，内部两列栅格
 * - lg（D3 工作台详情）：基准 56rem，宽屏允许上探 min(61rem, 90vw)（≈980px 双栏工作台）
 */
type DrawerSize = 'sm' | 'md' | 'lg'

const SIZE_WIDTH: Record<DrawerSize, string> = {
  sm: '28rem',
  md: '40rem',
  lg: 'min(61rem, 90vw)',
}

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /**
   * @deprecated 详情载体已按信息密度分档（size: sm/md/lg），
   * 自由宽度仅为存量调用兼容保留，新代码一律使用 size。
   */
  width?: string
  /** 载体分档，默认 sm（28rem，与历史默认一致）；显式传入的 width 优先于 size */
  size?: DrawerSize
}

export default function Drawer({ open, onClose, title, children, width, size = 'sm' }: DrawerProps) {
  const maxWidth = width ?? SIZE_WIDTH[size]
  return (
    <DialogBase
      open={open}
      onClose={onClose}
      label={title}
      placement="right"
      panelClassName="h-full w-full animate-slide-in-right border-l border-border bg-surface shadow-2xl"
      panelStyle={{ maxWidth }}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <div className="h-[calc(100vh-3.5rem)] overflow-auto p-5">
        {children}
      </div>
    </DialogBase>
  )
}
