import { describe, it, expect, vi } from 'vitest'
import { getPackageVersion } from '../../../src/lib/version.js'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}))

import { readFileSync } from 'node:fs'

describe('version', () => {
  it('returns version from package.json', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: '2.3.0' }))
    expect(getPackageVersion()).toBe('2.3.0')
  })

  it('returns fallback when version missing', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}))
    expect(getPackageVersion()).toBe('0.0.0')
  })

  it('returns fallback on read error', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('file not found')
    })
    expect(getPackageVersion()).toBe('0.0.0')
  })
})
