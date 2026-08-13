import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadCSV, getFieldValue, exportConfigs } from './export.js'

describe('getFieldValue', () => {
  it('returns empty string for missing field', () => {
    expect(getFieldValue({}, 'name')).toBe('')
  })

  it('returns nested field value via dot path', () => {
    expect(getFieldValue({ project: { name: '商机A' } }, 'project.name')).toBe('商机A')
  })

  it('returns empty string when nested path breaks', () => {
    expect(getFieldValue({ project: null }, 'project.name')).toBe('')
  })

  it('formats boolean as 是/否', () => {
    expect(getFieldValue({ active: true }, 'active')).toBe('是')
    expect(getFieldValue({ active: false }, 'active')).toBe('否')
  })

  it('formats number as string', () => {
    expect(getFieldValue({ amount: 100 }, 'amount')).toBe('100')
  })

  it('formats ISO date string to locale string', () => {
    const result = getFieldValue({ createdAt: '2026-06-17T08:00:00.000Z' }, 'createdAt')
    expect(result).not.toBe('2026-06-17T08:00:00.000Z')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns plain string as-is', () => {
    expect(getFieldValue({ name: '测试' }, 'name')).toBe('测试')
  })
})

describe('exportConfigs', () => {
  it('defines configs for all major entities', () => {
    const labels = exportConfigs.map((c) => c.label)
    expect(labels).toContain('线索')
    expect(labels).toContain('商机')
    expect(labels).toContain('客户')
    expect(labels).toContain('拜访')
  })

  it('每个配置 headers 和 fields 数量一致', () => {
    for (const config of exportConfigs) {
      expect(config.headers.length).toBe(config.fields.length)
    }
  })
})

describe('downloadCSV', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>
  let appendChildSpy: ReturnType<typeof vi.spyOn>
  let removeChildSpy: ReturnType<typeof vi.spyOn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clickSpy = vi.fn()
    const fakeLink = { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement
    createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(fakeLink) as ReturnType<typeof vi.spyOn>
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(((n: Node) => n) as typeof document.body.appendChild) as ReturnType<typeof vi.spyOn>
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(((n: Node) => n) as typeof document.body.removeChild) as ReturnType<typeof vi.spyOn>
    // happy-dom 可能未实现 createObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    createElementSpy.mockRestore()
    appendChildSpy.mockRestore()
    removeChildSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('creates a download link and triggers click', () => {
    downloadCSV('test.csv', [
      ['名称', '金额'],
      ['商机A', '100'],
    ])
    expect(createElementSpy).toHaveBeenCalledWith('a')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(appendChildSpy).toHaveBeenCalled()
    expect(removeChildSpy).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('escapes cells containing commas and quotes', () => {
    let captured: BlobPart[] = []
    const OriginalBlob = global.Blob
    global.Blob = vi.fn((parts: BlobPart[]) => {
      captured = parts
      return new OriginalBlob(parts)
    }) as unknown as typeof Blob

    downloadCSV('test.csv', [['含,逗号', '含"引号']])

    const csv = String(captured[0])
    expect(csv).toContain('"含,逗号"')
    expect(csv).toContain('"含""引号"')

    global.Blob = OriginalBlob
  })
})
