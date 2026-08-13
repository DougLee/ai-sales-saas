import { useCallback, useRef, useState } from 'react'
import ConfirmDialog from '../components/ui/confirm-dialog.js'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  requireText?: string
}

/**
 * 命令式确认弹窗 hook：`if (!(await confirm({...}))) return`
 * 把返回的 `dialog` 渲染到 JSX 末尾即可（替代裸 window.confirm）。
 */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setOptions(opts)
    })
  }, [])

  const settle = useCallback((ok: boolean) => {
    resolverRef.current?.(ok)
    resolverRef.current = null
    setOptions(null)
  }, [])

  const dialog = options ? (
    <ConfirmDialog
      open
      title={options.title}
      description={options.description}
      confirmLabel={options.confirmLabel}
      danger={options.danger}
      requireText={options.requireText}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null

  return { confirm, dialog }
}
