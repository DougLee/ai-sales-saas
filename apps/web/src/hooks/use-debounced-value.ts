import { useEffect, useState } from 'react'

/** 防抖值：搜索框输入停顿 delay 毫秒后才更新，避免每击键一次请求 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
