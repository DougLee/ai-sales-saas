import mammoth from 'mammoth'

/**
 * 解析不同格式的文件内容为纯文本
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  const type = mimeType.toLowerCase()

  if (type.includes('text') || type.includes('markdown') || type.includes('csv')) {
    return buffer.toString('utf-8')
  }

  if (type.includes('pdf')) {
    // 绕过 pdf-parse@1.1.1 入口文件的硬编码测试路径 bug
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js')
    const data = await pdfParse(buffer)
    return data.text || ''
  }

  if (type.includes('word') || type.includes('officedocument')) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  }

  // 未知格式，尝试按文本读取
  try {
    return buffer.toString('utf-8')
  } catch {
    return ''
  }
}

/**
 * 截断文本到最大长度，保留上下文
 */
export function truncateText(text: string, maxChars = 12000): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '\n...（内容已截断）'
}
