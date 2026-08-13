import { toast } from './toast.js'

export interface ApiErrorResponse {
  success: false
  error?: {
    code?: string
    message?: string
  }
  message?: string
}

/**
 * 统一处理 API / 未知错误，显示 toast 并返回可读错误信息。
 *
 * @param err 捕获到的错误对象
 * @param fallback 兜底文案
 * @returns 最终展示的错误文案
 */
export function handleApiError(err: unknown, fallback = '操作失败'): string {
  let message = fallback

  if (err instanceof Error) {
    message = err.message || fallback
  } else if (typeof err === 'string') {
    message = err || fallback
  } else if (err && typeof err === 'object') {
    const maybe = err as ApiErrorResponse
    if (maybe.error?.message) {
      message = maybe.error.message
    } else if (maybe.message) {
      message = maybe.message
    }
  }

  toast.error(message)
  return message
}

/**
 * 判断错误是否为已取消/已中断的请求，用于避免重复提示。
 */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
