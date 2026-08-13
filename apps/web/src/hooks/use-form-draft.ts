import { useCallback, useEffect, useRef } from 'react'

const DRAFT_PREFIX = 'ai-sales-draft:'

/**
 * 表单草稿自动保存 Hook。
 *
 * 用法：
 *   const { restore, save, clear } = useFormDraft<FormState>('customer-form', enabled)
 *   useEffect(() => { const d = restore(); if (d) setState(d) }, [])
 *   useEffect(() => { save(state) }, [state])   // 防抖后写入 localStorage
 *   // 提交成功后调用 clear()
 *
 * @param key     草稿唯一标识（建议带上业务 id，如 `customer-form:new`）
 * @param enabled 是否启用（如表单关闭时传 false，避免无谓写入）
 * @param debounceMs 写入防抖（默认 500ms）
 */
export function useFormDraft<T>(key: string, enabled = true, debounceMs = 500) {
  const storageKey = DRAFT_PREFIX + key
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const restore = useCallback((): T | null => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  }, [storageKey])

  const clear = useCallback(() => {
    if (typeof window === 'undefined') return
    if (timerRef.current) clearTimeout(timerRef.current)
    localStorage.removeItem(storageKey)
  }, [storageKey])

  const save = useCallback(
    (data: T) => {
      if (!enabled || typeof window === 'undefined') return
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(data))
        } catch {
          // 忽略 localStorage 写入异常（如隐私模式 / 配额超限）
        }
      }, debounceMs)
    },
    [enabled, storageKey, debounceMs],
  )

  // 卸载时清理定时器，避免在已卸载组件上写入
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { restore, save, clear }
}
