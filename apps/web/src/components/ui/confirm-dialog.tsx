import { useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import DialogBase from './dialog-base.js'

export interface ConfirmDialogProps {
  open: boolean
  /** 标题，如「删除客户」 */
  title: string
  /** 补充说明，说清楚后果 */
  description?: string
  /** 确认按钮文字，默认「确认」 */
  confirmLabel?: string
  /** 危险操作：红色按钮 + 警告图标 */
  danger?: boolean
  /** 最高防护：必须输入该文本（通常是对象名）才能点确认，用于不可逆操作 */
  requireText?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 统一确认弹窗（三级防护）：
 * - 普通：标题+说明+确认/取消
 * - danger：红色确认按钮 + 警告图标
 * - requireText：输入对象名完全匹配才解锁确认按钮（合并客户等不可逆操作）
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  danger = false,
  requireText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const needType = !!requireText
  const canConfirm = !needType || typed.trim() === requireText
  const Icon = danger ? AlertTriangle : Info

  return (
    <DialogBase
      open={open}
      onClose={onCancel}
      label={title}
      panelClassName="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
    >
      <div role="alertdialog" aria-label={title}>
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
            {description && (
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{description}</p>
            )}
          </div>
        </div>

        {needType && (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs text-text-tertiary">
              请输入「{requireText}」以确认操作
            </label>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireText}
              className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none focus:border-danger"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-40 ${
              danger ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogBase>
  )
}
