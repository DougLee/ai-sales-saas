import { useSyncExternalStore } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
}

type Listener = (toasts: ToastItem[]) => void

let toasts: ToastItem[] = []
const listeners = new Set<Listener>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

// 错误停留更久（用户需要时间看清原因），成功/信息短促
const DURATION: Record<ToastType, number> = {
  success: 3000,
  info: 4000,
  error: 6000,
}

function emit() {
  listeners.forEach((l) => l([...toasts]))
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return toasts
}

export function useToasts() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function dismissToast(id: string) {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  if (toasts.some((t) => t.id === id)) {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }
}

export function toast(message: string, type: ToastType = 'info') {
  const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  toasts = [...toasts, { id, type, message }]
  emit()
  timers.set(id, setTimeout(() => dismissToast(id), DURATION[type]))
}

toast.success = (message: string) => toast(message, 'success')
toast.error = (message: string) => toast(message, 'error')
toast.info = (message: string) => toast(message, 'info')
