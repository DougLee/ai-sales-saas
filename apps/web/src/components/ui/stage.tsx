import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import DialogBase from './dialog-base.js'

/**
 * 居中舞台（issue #40 载体形态收尾）：
 * 详情是主工作界面时用 Stage 而非右抽屉——视线居中、两侧留白、比例稳定。
 * 与 Drawer 的分工：
 *  - Stage（居中大面板）：线索/客户/商机等主工作台详情，需要反复操作与决策
 *  - Drawer（右侧）：轻确认、列表侧栏快览（任务详情、确认单）
 * 宽度分档与 Drawer 对齐：sm 640 / md 880 / lg 1120px，高度统一 88vh。
 */

const SIZE_CLASS: Record<StageSize, string> = {
  sm: 'max-w-[640px]',
  md: 'max-w-[880px]',
  lg: 'max-w-[1120px]',
}

export type StageSize = 'sm' | 'md' | 'lg'

interface StageProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: StageSize
  /** 头区右侧槽位（放主行动按钮） */
  headerExtra?: ReactNode
}

export default function Stage({ open, onClose, title, children, size = 'md', headerExtra }: StageProps) {
  return (
    <DialogBase
      open={open}
      onClose={onClose}
      label={title}
      placement="center"
      panelClassName={`flex h-[88vh] w-[94vw] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-stage-in ${SIZE_CLASS[size]}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <div className="flex items-center gap-3">
          {headerExtra}
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary"
          >
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
    </DialogBase>
  )
}
