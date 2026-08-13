import { describe, it, expect } from 'vitest'
import { toLocalInputValue, localInputToISO } from './datetime.js'

describe('toLocalInputValue', () => {
  it('把 UTC ISO 串转成本地 datetime-local 值（不是简单 slice）', () => {
    // 2026-08-10T00:30:00Z 在 UTC+8 是 08:30；slice(0,16) 会错误得到 00:30
    const iso = '2026-08-10T00:30:00.000Z'
    const result = toLocalInputValue(iso)
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    expect(result).toBe(expected)
    // 非零时区下，结果必不等于简单 slice（slice 得到的是 UTC 值）
    if (new Date().getTimezoneOffset() !== 0) {
      expect(result).not.toBe(iso.slice(0, 16))
    }
  })

  it('非法输入返回空串', () => {
    expect(toLocalInputValue('not-a-date')).toBe('')
    expect(toLocalInputValue('')).toBe('')
  })
})

describe('localInputToISO', () => {
  it('datetime-local 值转 ISO（可被 zod datetime 校验接受）', () => {
    const iso = localInputToISO('2026-08-10T14:30')
    expect(iso).toBe(new Date('2026-08-10T14:30').toISOString())
  })

  it('空值/非法值返回 undefined', () => {
    expect(localInputToISO('')).toBeUndefined()
    expect(localInputToISO('garbage')).toBeUndefined()
  })

  it('与 toLocalInputValue 互逆', () => {
    const local = '2026-03-05T09:15'
    const roundTrip = toLocalInputValue(localInputToISO(local)!)
    expect(roundTrip).toBe(local)
  })
})
