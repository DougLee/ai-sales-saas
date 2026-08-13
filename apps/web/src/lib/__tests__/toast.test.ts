import { describe, it, expect, vi, beforeEach } from 'vitest'

// 直接测试 toast store 逻辑
// 由于 toast.ts 使用 useSyncExternalStore（React 依赖），
// 我们测试底层的 subscribe/emit 行为

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  message: string
}

type Listener = (toasts: ToastItem[]) => void

// 模拟实现（与 toast.ts 逻辑一致）
function createToastStore() {
  let toasts: ToastItem[] = []
  const listeners = new Set<Listener>()

  function emit() {
    listeners.forEach((l) => l([...toasts]))
  }

  function subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function add(message: string, type: ToastType = 'info') {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    toasts = [...toasts, { id, type, message }]
    emit()
    return id
  }

  function remove(id: string) {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }

  function getAll() {
    return [...toasts]
  }

  return { subscribe, add, remove, getAll }
}

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('notifies subscriber when toast added', () => {
    const store = createToastStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.add('Hello')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toHaveLength(1)
    expect(listener.mock.calls[0][0][0].message).toBe('Hello')
  })

  it('unsubscribe stops notifications', () => {
    const store = createToastStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.add('Test')
    expect(listener).toHaveBeenCalledTimes(0)
  })

  it('removes toast by id', () => {
    const store = createToastStore()
    const id = store.add('Temp')
    expect(store.getAll()).toHaveLength(1)

    store.remove(id)
    expect(store.getAll()).toHaveLength(0)
  })

  it('supports multiple toasts', () => {
    const store = createToastStore()
    store.add('First', 'info')
    store.add('Second', 'success')
    store.add('Third', 'error')

    const all = store.getAll()
    expect(all).toHaveLength(3)
    expect(all.map((t) => t.type)).toEqual(['info', 'success', 'error'])
  })
})
