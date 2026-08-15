import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import DialogBase from './dialog-base.js'

/**
 * 详情载体分层（issue #37）：
 *  - sm (28rem/448px)：轻确认——任务详情、确认单
 *  - md (40rem/640px)：标准详情——线索/客户/拜访详情，内部用两列栅格
 *  - lg (56rem/896px)：工作台详情——商机详情双栏、分区表单
 * 自由 width 传参保留兼容（deprecated），新代码一律用 size。
 */

const SIZE_WIDTH: Record<DrawerSize, string> = {
  sm: '28rem',
  md: '40rem',
  lg: '56rem',
}

export type DrawerSize = 'sm' | 'md' | 'lg'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: DrawerSize
  /** @deprecated 用 size 分档 */
  width?: string
}

export default function Drawer({ open, onClose, title, children, size, width }: DrawerProps) {
  const maxWidth = width ?? SIZE_WIDTH[size ?? 'sm']
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
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary"
        >
          <X size={18} />
        </button>
      </div>
      <div className="h-[calc(100vh-3.5rem)] overflow-auto p-5">{children}</div>
    </DialogBase>
  )
}
