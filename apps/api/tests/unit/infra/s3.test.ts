import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ ...input, __type: 'PutObjectCommand' })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ ...input, __type: 'GetObjectCommand' })),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url'),
}))

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'

describe('s3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  async function loadS3() {
    return import('../../../src/infra/s3.js')
  }

  describe('uploadFile', () => {
    it('uploads to S3 when available', async () => {
      const send = vi.fn().mockResolvedValue({})
      vi.mocked(S3Client).mockImplementationOnce(() => ({ send }) as never)
      const { uploadFile } = await loadS3()

      const result = await uploadFile('test/key', Buffer.from('hello'), 'text/plain')

      expect(PutObjectCommand).toHaveBeenCalled()
      expect(send).toHaveBeenCalled()
      expect(result.key).toBe('test/key')
    })

    it('falls back to local filesystem on S3 error', async () => {
      const send = vi.fn().mockRejectedValue(new Error('S3 down'))
      vi.mocked(S3Client).mockImplementationOnce(() => ({ send }) as never)
      vi.mocked(existsSync).mockReturnValue(false)

      const { uploadFile } = await loadS3()
      const result = await uploadFile('test/key', Buffer.from('hello'), 'text/plain')

      expect(mkdirSync).toHaveBeenCalled()
      expect(writeFileSync).toHaveBeenCalled()
      expect(result.url.startsWith('file://')).toBe(true)
    })
  })

  describe('downloadFile', () => {
    it('downloads from S3 when available', async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from('content'))
          controller.close()
        },
      })
      const send = vi.fn().mockResolvedValue({ Body: body })
      vi.mocked(S3Client).mockImplementationOnce(() => ({ send }) as never)

      const { downloadFile } = await loadS3()
      const result = await downloadFile('test/key')
      expect(result.toString()).toBe('content')
    })

    it('falls back to local filesystem on S3 error', async () => {
      const send = vi.fn().mockRejectedValue(new Error('S3 down'))
      vi.mocked(S3Client).mockImplementationOnce(() => ({ send }) as never)
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(Buffer.from('local content'))

      const { downloadFile } = await loadS3()
      const result = await downloadFile('test/key')
      expect(result.toString()).toBe('local content')
    })

    it('throws when local file not found', async () => {
      const send = vi.fn().mockRejectedValue(new Error('S3 down'))
      vi.mocked(S3Client).mockImplementationOnce(() => ({ send }) as never)
      vi.mocked(existsSync).mockReturnValue(false)

      const { downloadFile } = await loadS3()
      await expect(downloadFile('missing/key')).rejects.toThrow('File not found')
    })
  })

  describe('getSignedDownloadUrl', () => {
    it('returns signed url', async () => {
      vi.mocked(S3Client).mockImplementationOnce(() => ({ send: vi.fn() }) as never)
      vi.mocked(getSignedUrl).mockResolvedValueOnce('https://signed-url')

      const { getSignedDownloadUrl: getUrl } = await loadS3()
      const url = await getUrl('test/key')
      expect(GetObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ Key: 'test/key' }))
      expect(url).toBe('https://signed-url')
    })
  })
})
