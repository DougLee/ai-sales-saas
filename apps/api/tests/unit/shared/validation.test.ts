import { describe, it, expect } from 'vitest'
import {
  isValidMobile,
  isValidLandline,
  isValidPhone,
  isValidEmail,
  normalizePhone,
} from '@ai-sales/shared'

describe('shared/validation', () => {
  describe('isValidMobile', () => {
    it('accepts a valid 11-digit mobile', () => {
      expect(isValidMobile('13800138000')).toBe(true)
    })
    it('rejects too-short numbers', () => {
      expect(isValidMobile('1380013800')).toBe(false)
    })
    it('rejects non-numeric input', () => {
      expect(isValidMobile('abc')).toBe(false)
    })
    it('rejects numbers not starting with 1[3-9]', () => {
      expect(isValidMobile('12800138000')).toBe(false)
    })
    it('treats empty/undefined as valid (optional field)', () => {
      expect(isValidMobile('')).toBe(true)
      expect(isValidMobile(undefined)).toBe(true)
      expect(isValidMobile(null)).toBe(true)
    })
  })

  describe('isValidLandline', () => {
    it('accepts hyphenated landlines', () => {
      expect(isValidLandline('010-12345678')).toBe(true)
      expect(isValidLandline('0571-1234567')).toBe(true)
    })
    it('accepts landlines without hyphen', () => {
      expect(isValidLandline('02112345678')).toBe(true)
    })
    it('accepts landlines with extension', () => {
      expect(isValidLandline('010-12345678-123')).toBe(true)
    })
    it('rejects mobile-shaped numbers as landline', () => {
      expect(isValidLandline('13800138000')).toBe(false)
    })
  })

  describe('isValidPhone', () => {
    it('accepts both mobile and landline', () => {
      expect(isValidPhone('13800138000')).toBe(true)
      expect(isValidPhone('010-12345678')).toBe(true)
    })
    it('rejects garbage', () => {
      expect(isValidPhone('1380013800')).toBe(false)
      expect(isValidPhone('abc')).toBe(false)
    })
  })

  describe('normalizePhone', () => {
    it('strips spaces and brackets', () => {
      expect(normalizePhone(' 138 0013 8000 ')).toBe('13800138000')
      expect(normalizePhone('(010)12345678')).toBe('01012345678')
    })
    it('returns empty string for nullish', () => {
      expect(normalizePhone(undefined)).toBe('')
      expect(normalizePhone(null)).toBe('')
    })
  })

  describe('isValidEmail', () => {
    it('accepts valid emails', () => {
      expect(isValidEmail('a@b.com')).toBe(true)
    })
    it('rejects invalid emails', () => {
      expect(isValidEmail('a@b')).toBe(false)
      expect(isValidEmail('foo')).toBe(false)
    })
    it('treats empty as valid', () => {
      expect(isValidEmail('')).toBe(true)
    })
  })
})
