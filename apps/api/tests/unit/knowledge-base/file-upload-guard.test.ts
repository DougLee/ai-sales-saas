import { describe, it, expect } from 'vitest'
import {
  extractExt,
  sanitizeFileName,
  findRule,
  validateUpload,
  KB_FILE_RULES,
  AUDIO_FILE_RULES,
} from '../../../src/knowledge-base/file-upload-guard.js'
import { AppError } from '../../../src/errors/app-error.js'
import { ErrorCode } from '../../../src/errors/error-codes.js'

describe('file-upload-guard', () => {
  describe('extractExt', () => {
    it('extracts lowercase extension', () => {
      expect(extractExt('Report.PDF')).toBe('pdf')
      expect(extractExt('path/to/file.docx')).toBe('docx')
    })

    it('returns empty for files without extension', () => {
      expect(extractExt('README')).toBe('')
      expect(extractExt('.gitignore')).toBe('')
    })
  })

  describe('sanitizeFileName', () => {
    it('removes path separators and dangerous chars', () => {
      expect(sanitizeFileName('../../../etc/passwd')).toBe('passwd')
      expect(sanitizeFileName('file<name>.txt')).toBe('file_name_.txt')
    })

    it('truncates long names', () => {
      const long = 'a'.repeat(300)
      expect(sanitizeFileName(`${long}.txt`).length).toBe(200)
    })
  })

  describe('findRule', () => {
    it('finds matching rule by ext and mimetype', () => {
      const rule = findRule(KB_FILE_RULES, 'pdf', 'application/pdf')
      expect(rule).toBeDefined()
      expect(rule?.ext).toBe('pdf')
    })

    it('returns undefined for mismatch', () => {
      expect(findRule(KB_FILE_RULES, 'pdf', 'image/png')).toBeUndefined()
      expect(findRule(KB_FILE_RULES, 'exe', 'application/pdf')).toBeUndefined()
    })
  })

  describe('validateUpload', () => {
    it('returns validation result for valid file', () => {
      const result = validateUpload('report.pdf', 'application/pdf', 1024, KB_FILE_RULES, 'tenant-1')
      expect(result.ext).toBe('pdf')
      expect(result.sanitizedName).toBe('report.pdf')
      expect(result.storageKey.startsWith('tenant-1/')).toBe(true)
      expect(result.storageKey.endsWith('.pdf')).toBe(true)
    })

    it('throws AppError for unsupported type', () => {
      expect(() =>
        validateUpload('malware.exe', 'application/x-msdownload', 1024, KB_FILE_RULES, 'tenant-1'),
      ).toThrow(AppError)

      try {
        validateUpload('malware.exe', 'application/x-msdownload', 1024, KB_FILE_RULES, 'tenant-1')
      } catch (err) {
        const appErr = err as AppError
        expect(appErr.code).toBe(ErrorCode.BAD_REQUEST)
        expect(appErr.statusCode).toBe(400)
      }
    })

    it('throws AppError for oversized file', () => {
      expect(() =>
        validateUpload('big.pdf', 'application/pdf', 100 * 1024 * 1024, KB_FILE_RULES, 'tenant-1'),
      ).toThrow(AppError)
    })

    it('validates audio files', () => {
      const result = validateUpload('recording.mp3', 'audio/mpeg', 1024, AUDIO_FILE_RULES, 'tenant-1')
      expect(result.ext).toBe('mp3')
      expect(result.storageKey.endsWith('.mp3')).toBe(true)
    })
  })
})
