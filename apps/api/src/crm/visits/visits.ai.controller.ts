import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { generateText } from 'ai'
import { createModel } from '../../config/model-provider.js'
import { llmConcurrencyLimiter } from '../../infra/concurrency-limiter.js'
import { z } from 'zod'
import { createAsrClient } from '../../infra/asr-client.js'
import { getAIConfig } from '../../config/ai-config.js'
import { AppError } from '../../errors/app-error.js'
import { ErrorCode } from '../../errors/error-codes.js'
import { validateUpload, AUDIO_FILE_RULES } from '../../knowledge-base/file-upload-guard.js'
import { scanFileContent } from '../../knowledge-base/content-scanner.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

const ExtractVisitSchema = z.object({ transcript: z.string().min(1) })

/**
 * 规范化 LLM 提取输出：模型常把缺省字段输出为 null、空串或非法日期，
 * 而下游 CreateVisitSchema 的 z.string().optional() 只认 undefined，null 会 400
 */
export function normalizeExtractedVisit(extracted: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['projectName', 'summary', 'contactName', 'contactPosition', 'nextAction']) {
    const v = extracted[key]
    if (typeof v !== 'string' || !v.trim()) delete extracted[key]
  }
  for (const key of ['visitTime', 'nextActionDeadline']) {
    const v = extracted[key]
    const d = typeof v === 'string' ? new Date(v) : null
    if (!d || Number.isNaN(d.getTime())) delete extracted[key]
    else extracted[key] = d.toISOString()
  }
  if (!['online', 'offline', 'phone'].includes(extracted.visitType as string)) {
    extracted.visitType = 'offline'
  }
  return extracted
}

export async function extract(req: FastifyRequest, reply: FastifyReply) {
  const { transcript } = ExtractVisitSchema.parse(req.body)
  const prisma = getPrisma(req)
  const userId = (req.user as { id?: string } | undefined)?.id || 'anonymous'

  const { text } = await llmConcurrencyLimiter.run(userId, () =>
    generateText({
      model: createModel() as unknown as Parameters<typeof generateText>[0]['model'],
      system: `你是销售拜访记录结构化提取助手。请从销售人员的语音转写文本中，提取以下字段并以JSON格式返回。
字段说明：
- projectName: 提到的客户/学校/项目名称（字符串）
- summary: 拜访内容摘要（字符串）
- visitType: 拜访方式，只能是 online（线上）、offline（线下）、phone（电话）之一
- visitTime: 拜访时间，格式为 ISO 8601 字符串，如无法推断则使用当前时间
- contactName: 联系人姓名（如有）
- contactPosition: 联系人职位（如有）
- nextAction: 下一步行动（如有）
- nextActionDeadline: 下一步截止时间，ISO 8601 格式（如有）

只返回纯JSON对象，不要包含任何markdown代码块标记或额外解释。`,
      prompt: transcript,
      temperature: 0.2,
    }),
  )

  let extracted: Record<string, unknown> = {}
  try {
    const clean = text.replace(/^```json\s*|\s*```$/g, '').trim()
    extracted = JSON.parse(clean)
  } catch {
    extracted = { summary: transcript, visitType: 'offline' }
  }

  // 规范化 LLM 输出（null/非法日期 → undefined，visitType 收敛到枚举）
  normalizeExtractedVisit(extracted)

  // 尝试根据 projectName 匹配已有商机
  if (extracted.projectName && typeof extracted.projectName === 'string') {
    const project = await prisma.project.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: extracted.projectName } },
          { company: { name: { contains: extracted.projectName } } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (project) {
      extracted.projectId = project.id
      extracted.projectName = project.name
    }
  }

  reply.send({ success: true, data: extracted })
}

export async function transcribe(req: FastifyRequest, reply: FastifyReply) {
  const data = await req.file()
  if (!data) {
    throw new AppError(ErrorCode.BAD_REQUEST, '请上传音频文件', 400)
  }

  const buffer = await data.toBuffer()
  const contentType = data.mimetype || 'application/octet-stream'
  const user = req.user as { tenantId?: string } | undefined
  const tenantId = user?.tenantId || 'default'

  const validation = validateUpload(data.filename || 'unnamed', contentType, buffer.length, AUDIO_FILE_RULES, tenantId)

  // 内容安全扫描：拦截伪装的可执行文件/脚本
  scanFileContent(buffer, validation.ext)

  const aiConfig = getAIConfig()
  if (!aiConfig.senseVoiceApiKey) {
    throw new AppError(
      ErrorCode.AI_SERVICE_ERROR,
      'ASR 服务未配置，请前往系统设置配置语音录入 Key',
      503,
    )
  }

  const client = createAsrClient('sensevoice', {
    apiKey: aiConfig.senseVoiceApiKey,
    endpoint: aiConfig.senseVoiceBaseUrl || '',
  })
  const result = await client.transcribe(buffer, { language: 'zh', mimeType: data.mimetype })

  reply.send({ success: true, data: { text: result.text, confidence: result.confidence } })
}
