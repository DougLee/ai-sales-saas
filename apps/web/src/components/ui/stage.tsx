import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import DialogBase from './dialog-base.js'

/**
 * Stage 居中舞台（issue #40 载体分工）：
 * 详情是「反复操作与决策」的主工作界面时用 Stage 居中大面板，而非右抽屉——
 * 视线居中、两侧留白对称、比例稳定。选型判据：要在这里「做事」→ Stage；只是「看一眼/确认」→ Drawer。
 * 宽度分档（与 #38 的 D 档意图一致，但按居中面板尺度放大）：
 * - sm 640px：线索 / 客户详情
 * - md 880px：商机详情
 * - lg 1120px：更宽的双栏工作台（预留）
 * 高度 max-h-88vh：短内容不撑满，长内容体区内部滚动。
 * API 与 Drawer 同签名（open/onClose/title/children + size），详情载体可低成本互换。
 */
export type StageSize = 'sm' | 'md' | 'lg'

const SIZE_WIDTH: Record<StageSize, string> = {
  sm: '40rem', // 640px
  md: '55rem', // 880px
  lg: '70rem', // 1120px
}

interface StageProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 载体分档，默认 md（880px 标准工作台舞台） */
  size?: StageSize
}

export default function Stage({ open, onClose, title, children, size = 'md' }: StageProps) {
  return (
    <DialogBase
      open={open}
      onClose={onClose}
      label={title}
      placement="center"
      panelClassName="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-stage-in"
      panelStyle={{ maxWidth: SIZE_WIDTH[size] }}
    >
      {/* 居中面板自带 header bar：标题 + 关闭（Esc / 点遮罩关闭由 DialogBase 提供） */}
      <div className="flex h-14 flex-none items-center justify-between border-b border-border px-5">
        <h3 className="truncate text-base font-semibold text-text-primary">{title}</h3>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary"
        >
          <X size={18} />
        </button>
      </div>
      {/* 体区滚动容器：p-5 与 Drawer 一致——DetailLayout 尾区粘底行动条的 -mx-5 出血对齐依赖此内边距 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
    </DialogBase>
  )
}
