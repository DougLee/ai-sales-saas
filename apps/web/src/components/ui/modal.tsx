import { X } from 'lucide-react'
import { type ReactNode } from 'react'
import DialogBase from './dialog-base.js'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  return (
    <DialogBase
      open={open}
      onClose={onClose}
      label={title}
      panelClassName="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl"
    >
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </DialogBase>
  )
}
