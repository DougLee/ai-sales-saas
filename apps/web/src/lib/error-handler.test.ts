import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleApiError, isAbortError } from './error-handler.js'
import { toast } from './toast.js'

vi.mock('./toast.js', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

describe('error-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles Error instance', () => {
    const message = handleApiError(new Error('网络请求失败'), '默认失败')
    expect(message).toBe('网络请求失败')
    expect(toast.error).toHaveBeenCalledWith('网络请求失败')
  })

  it('handles string error', () => {
    const message = handleApiError('字符串错误')
    expect(message).toBe('字符串错误')
    expect(toast.error).toHaveBeenCalledWith('字符串错误')
  })

  it('handles API error response object', () => {
    const message = handleApiError({ success: false, error: { message: 'API 返回错误' } })
    expect(message).toBe('API 返回错误')
    expect(toast.error).toHaveBeenCalledWith('API 返回错误')
  })

  it('handles legacy message field', () => {
    const message = handleApiError({ success: false, message: '旧格式错误' })
    expect(message).toBe('旧格式错误')
    expect(toast.error).toHaveBeenCalledWith('旧格式错误')
  })

  it('uses fallback for empty error', () => {
    const message = handleApiError({}, '自定义兜底')
    expect(message).toBe('自定义兜底')
    expect(toast.error).toHaveBeenCalledWith('自定义兜底')
  })

  it('uses fallback for null/undefined', () => {
    expect(handleApiError(null)).toBe('操作失败')
    expect(handleApiError(undefined)).toBe('操作失败')
  })

  it('detects AbortError', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isAbortError(new Error('other'))).toBe(false)
  })
})
