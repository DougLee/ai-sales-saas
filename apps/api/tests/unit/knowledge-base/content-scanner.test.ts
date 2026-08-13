import { describe, it, expect } from 'vitest'
import { scanFileContent } from '../../../src/knowledge-base/content-scanner.js'
import { AppError } from '../../../src/errors/app-error.js'

function buf(bytes: number[], padTo = 16): Buffer {
  const arr = [...bytes]
  while (arr.length < padTo) arr.push(0x00)
  return Buffer.from(arr)
}

describe('content-scanner', () => {
  describe('dangerous signatures', () => {
    it('rejects Windows PE executable disguised as pdf', () => {
      const pe = buf([0x4d, 0x5a, 0x90, 0x00])
      expect(() => scanFileContent(pe, 'pdf')).toThrow(AppError)
      expect(() => scanFileContent(pe, 'pdf')).toThrow(/可疑文件内容/)
    })

    it('rejects ELF executable', () => {
      const elf = buf([0x7f, 0x45, 0x4c, 0x46])
      expect(() => scanFileContent(elf, 'docx')).toThrow(/可疑文件内容/)
    })

    it('rejects shell script', () => {
      const sh = buf([0x23, 0x21, 0x2f, 0x62, 0x69, 0x6e])
      expect(() => scanFileContent(sh, 'txt')).toThrow(/可疑文件内容/)
    })

    it('rejects Mach-O binary', () => {
      const macho = buf([0xcf, 0xfa, 0xed, 0xfe])
      expect(() => scanFileContent(macho, 'mp3')).toThrow(/可疑文件内容/)
    })
  })

  describe('magic vs extension consistency', () => {
    it('accepts valid pdf', () => {
      const pdf = buf([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e])
      expect(() => scanFileContent(pdf, 'pdf')).not.toThrow()
    })

    it('accepts docx (zip container)', () => {
      const zip = buf([0x50, 0x4b, 0x03, 0x04])
      expect(() => scanFileContent(zip, 'docx')).not.toThrow()
    })

    it('accepts legacy doc (OLE container)', () => {
      const ole = buf([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      expect(() => scanFileContent(ole, 'doc')).not.toThrow()
    })

    it('accepts mp3 with ID3 header', () => {
      const mp3 = buf([0x49, 0x44, 0x33, 0x04])
      expect(() => scanFileContent(mp3, 'mp3')).not.toThrow()
    })

    it('accepts m4a with ftyp at offset 4', () => {
      const m4a = buf([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70])
      expect(() => scanFileContent(m4a, 'm4a')).not.toThrow()
    })

    it('rejects pdf extension with zip content', () => {
      const zip = buf([0x50, 0x4b, 0x03, 0x04])
      expect(() => scanFileContent(zip, 'pdf')).toThrow(/与扩展名/)
    })

    it('rejects docx extension with pdf content', () => {
      const pdf = buf([0x25, 0x50, 0x44, 0x46])
      expect(() => scanFileContent(pdf, 'docx')).toThrow(/与扩展名/)
    })
  })

  describe('text and unregistered types', () => {
    it('skips magic check for txt', () => {
      const text = Buffer.from('这是一段普通文本内容', 'utf-8')
      expect(() => scanFileContent(text, 'txt')).not.toThrow()
    })

    it('skips magic check for md', () => {
      const md = Buffer.from('# 标题\n正文', 'utf-8')
      expect(() => scanFileContent(md, 'md')).not.toThrow()
    })

    it('skips consistency check for webm (only danger scan)', () => {
      const webm = buf([0x1a, 0x45, 0xdf, 0xa3])
      expect(() => scanFileContent(webm, 'webm')).not.toThrow()
    })

    it('skips consistency check for unregistered extension', () => {
      const unknown = buf([0x01, 0x02, 0x03, 0x04])
      expect(() => scanFileContent(unknown, 'csv')).not.toThrow()
    })
  })
})
