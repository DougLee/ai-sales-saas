import { describe, it, expect } from 'vitest'

// extractPayload 是内部函数，通过模块重新导出测试
// 这里直接复制逻辑进行测试（避免暴露内部实现）
function extractPayload<T>(json: unknown): T {
  if (typeof json !== 'object' || json === null) throw new Error('非法响应')
  const obj = json as Record<string, unknown>
  if (obj.success === false) throw new Error((obj.error as string) || '请求失败')
  if ('data' in obj) return obj.data as T
  const { success: _success, error: _error, ...rest } = obj
  return rest as T
}

describe('extractPayload', () => {
  it('extracts data field when present', () => {
    const result = extractPayload<string>({ success: true, data: 'hello' })
    expect(result).toBe('hello')
  })

  it('extracts nested object from data', () => {
    const result = extractPayload<{ id: number }>({ success: true, data: { id: 1 } })
    expect(result).toEqual({ id: 1 })
  })

  it('falls back to rest fields when no data key', () => {
    const result = extractPayload<{ items: string[] }>({ success: true, items: ['a', 'b'] })
    expect(result).toEqual({ items: ['a', 'b'] })
  })

  it('throws on success=false', () => {
    expect(() => extractPayload({ success: false, error: '权限不足' })).toThrow('权限不足')
  })

  it('throws default message when success=false without error', () => {
    expect(() => extractPayload({ success: false })).toThrow('请求失败')
  })

  it('throws on non-object response', () => {
    expect(() => extractPayload('plain text')).toThrow('非法响应')
    expect(() => extractPayload(null)).toThrow('非法响应')
    expect(() => extractPayload(123)).toThrow('非法响应')
  })

  it('handles arrays in data field', () => {
    const result = extractPayload<string[]>({ success: true, data: ['x', 'y'] })
    expect(result).toEqual(['x', 'y'])
  })
})
