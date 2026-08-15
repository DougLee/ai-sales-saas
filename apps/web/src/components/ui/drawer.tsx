import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import DialogBase from './dialog-base.js'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}

export default function Drawer({ open, onClose, title, children, width = '28rem' }: DrawerProps) {
  return (
    <DialogBase
      open={open}
      onClose={onClose}
      label={title}
      placement="right"
      panelClassName="h-full w-full animate-slide-in-right border-l border-border bg-surface shadow-2xl"
      panelStyle={{ maxWidth: width }}
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
