import { randomUUID } from 'node:crypto'
import { AppError } from '../errors/app-error.js'
import { ErrorCode } from '../errors/error-codes.js'

export interface FileTypeRule {
  ext: string
  mimetypes: string[]
  maxBytes: number
}

/**
 * 知识库文件类型白名单
 */
export const KB_FILE_RULES: FileTypeRule[] = [
  { ext: 'pdf', mimetypes: ['application/pdf'], maxBytes: 50 * 1024 * 1024 },
  { ext: 'docx', mimetypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], maxBytes: 50 * 1024 * 1024 },
  { ext: 'doc', mimetypes: ['application/msword'], maxBytes: 50 * 1024 * 1024 },
  { ext: 'txt', mimetypes: ['text/plain'], maxBytes: 10 * 1024 * 1024 },
  { ext: 'md', mimetypes: ['text/markdown', 'text/x-markdown'], maxBytes: 10 * 1024 * 1024 },
  { ext: 'xlsx', mimetypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], maxBytes: 20 * 1024 * 1024 },
  { ext: 'xls', mimetypes: ['application/vnd.ms-excel'], maxBytes: 20 * 1024 * 1024 },
  { ext: 'pptx', mimetypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], maxBytes: 50 * 1024 * 1024 },
  { ext: 'ppt', mimetypes: ['application/vnd.ms-powerpoint'], maxBytes: 50 * 1024 * 1024 },
]

/**
 * 音频文件类型白名单
 */
export const AUDIO_FILE_RULES: FileTypeRule[] = [
  { ext: 'mp3', mimetypes: ['audio/mpeg', 'audio/mp3'], maxBytes: 100 * 1024 * 1024 },
  { ext: 'wav', mimetypes: ['audio/wav', 'audio/x-wav'], maxBytes: 200 * 1024 * 1024 },
  { ext: 'm4a', mimetypes: ['audio/mp4', 'audio/x-m4a'], maxBytes: 100 * 1024 * 1024 },
  { ext: 'webm', mimetypes: ['audio/webm'], maxBytes: 100 * 1024 * 1024 },
  { ext: 'ogg', mimetypes: ['audio/ogg'], maxBytes: 100 * 1024 * 1024 },
]

/**
 * 提取并规范化扩展名（小写，不含点）
 */
export function extractExt(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || filename
  const lastDot = base.lastIndexOf('.')
  if (lastDot <= 0) return ''
  return base.slice(lastDot + 1).toLowerCase().trim()
}

/**
 * 净化原始文件名：移除路径、控制字符，截断长度
 */
export function sanitizeFileName(filename: string, maxLength = 200): string {
  const base = filename.split(/[\\/]/).pop() || filename
  return base
    // 明确移除控制字符（0x00-0x1f 与 0x7f），用于安全清理文件名
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .slice(0, maxLength)
    .trim()
}

/**
 * 查找匹配的规则
 */
export function findRule(rules: FileTypeRule[], ext: string, mimetype: string): FileTypeRule | undefined {
  return rules.find((rule) => {
    const extMatch = rule.ext === ext
    const mimeMatch = rule.mimetypes.includes(mimetype)
    return extMatch && mimeMatch
  })
}

export interface ValidateUploadResult {
  ext: string
  sanitizedName: string
  rule: FileTypeRule
  storageKey: string
}

/**
 * 校验上传文件并生成安全存储 key
 */
export function validateUpload(
  filename: string,
  mimetype: string,
  fileSize: number,
  rules: FileTypeRule[],
  tenantId: string,
): ValidateUploadResult {
  const sanitizedName = sanitizeFileName(filename)
  if (!sanitizedName) {
    throw new AppError(ErrorCode.BAD_REQUEST, '文件名无效', 400)
  }

  const ext = extractExt(sanitizedName)
  if (!ext) {
    throw new AppError(ErrorCode.BAD_REQUEST, '无法识别文件扩展名', 400)
  }

  const rule = findRule(rules, ext, mimetype)
  if (!rule) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      `不支持的文件类型：.${ext} (${mimetype})`,
      400,
      { allowedExts: rules.map((r) => r.ext) },
    )
  }

  if (fileSize > rule.maxBytes) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      `文件大小超过限制：${formatBytes(fileSize)}，最大允许 ${formatBytes(rule.maxBytes)}`,
      400,
      { maxBytes: rule.maxBytes },
    )
  }

  const storageKey = `${tenantId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`

  return { ext, sanitizedName, rule, storageKey }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
