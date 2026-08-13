import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../config/env.js'
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true })
  }
}

const s3Client = new S3Client({
  endpoint: env.MINIO_ENDPOINT || 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: env.MINIO_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true,
})

const BUCKET_NAME = 'ai-sales'

let s3Available = true

export async function uploadFile(key: string, body: Buffer, contentType: string) {
  if (s3Available) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      )
      return { key, url: `${env.MINIO_ENDPOINT}/${BUCKET_NAME}/${key}` }
    } catch {
      s3Available = false
      // fall through to local storage
    }
  }

  // Local filesystem fallback
  ensureUploadDir()
  const localPath = join(UPLOAD_DIR, key.replace(/\//g, '-'))
  writeFileSync(localPath, body)
  return { key, url: `file://${localPath}` }
}

export async function downloadFile(key: string): Promise<Buffer> {
  if (s3Available) {
    try {
      const res = await s3Client.send(
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
      )
      if (!res.Body) throw new Error('Empty response body from S3')
      const chunks: Uint8Array[] = []
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }
      return Buffer.concat(chunks)
    } catch {
      s3Available = false
      // fall through to local storage
    }
  }

  // Local filesystem fallback
  const localPath = join(UPLOAD_DIR, key.replace(/\//g, '-'))
  if (!existsSync(localPath)) {
    throw new Error(`File not found: ${key}`)
  }
  return readFileSync(localPath)
}

export async function getSignedDownloadUrl(key: string, expiresIn = 3600) {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
    { expiresIn }
  )
}

/**
 * 按存储 URL 删除文件（V6.1 录音合规：音频留存清理用）
 * 兼容两种 URL 形态：MinIO/S3（<endpoint>/<bucket>/<key>）与本地降级（file://<path>）
 * 删除失败返回 false 不抛出（清理任务容错，下轮再扫）
 */
export async function deleteFileByUrl(url: string): Promise<boolean> {
  try {
    if (url.startsWith('file://')) {
      const localPath = url.slice('file://'.length)
      if (existsSync(localPath)) unlinkSync(localPath)
      return true
    }
    const prefix = `${env.MINIO_ENDPOINT}/${BUCKET_NAME}/`
    if (!url.startsWith(prefix)) return false
    const key = url.slice(prefix.length)
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
    return true
  } catch {
    return false
  }
}

export { s3Client, BUCKET_NAME }
