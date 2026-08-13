import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { generateText } from 'ai'
import { getAIConfig, updateAIConfig } from './ai-config.js'
import { createModel } from './model-provider.js'
import { llmConcurrencyLimiter } from '../infra/concurrency-limiter.js'
import { testEmbeddingConnection } from '../knowledge-base/embedding-provider.js'
import { PROVIDER_PRESETS, getProviderCapabilities } from './provider-registry.js'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'
import { ErrorCode } from '../errors/error-codes.js'
import { prisma } from '../config/database.js'
import { logAudit, ctxFromRequest } from '../infra/audit-middleware.js'
import { requireRoles } from '../plugins/rbac.plugin.js'

/** AI 系统配置属全局运维操作，仅租户管理员及以上可见/可改 */
const ADMIN_ONLY = { preHandler: [requireRoles('TENANT_ADMIN', 'SUPER_ADMIN')] }

const UpdateSchema = z.object({
  provider: z.string().optional(),
  openaiApiKey: z.string().optional(),
  openaiBaseUrl: z.string().optional(),
  modelName: z.string().optional(),
  bingSearchApiKey: z.string().optional(),
  tavilyApiKey: z.string().optional(),
  embeddingModelName: z.string().optional(),
  embeddingDimension: z.number().optional(),
  embeddingUseSameCredentials: z.boolean().optional(),
  embeddingBaseUrl: z.string().optional(),
  embeddingApiKey: z.string().optional(),
  senseVoiceApiKey: z.string().optional(),
  senseVoiceBaseUrl: z.string().optional(),
})

export async function aiConfigRoutes(app: FastifyInstance) {
  app.get('/api/system-config/ai', ADMIN_ONLY, async (_req: FastifyRequest, reply: FastifyReply) => {
    const config = getAIConfig()
    const capabilities = getProviderCapabilities(config.provider)
    reply.send({
      success: true,
      data: {
        provider: config.provider,
        openaiApiKey: config.openaiApiKey ? '***' + config.openaiApiKey.slice(-4) : '',
        openaiBaseUrl: config.openaiBaseUrl,
        modelName: config.modelName,
        hasKey: !!config.openaiApiKey,
        bingSearchApiKey: config.bingSearchApiKey ? '***' + config.bingSearchApiKey.slice(-4) : '',
        tavilyApiKey: config.tavilyApiKey ? '***' + config.tavilyApiKey.slice(-4) : '',
        hasSearch: !!config.bingSearchApiKey || !!config.tavilyApiKey,
        embeddingModelName: config.embeddingModelName,
        embeddingDimension: config.embeddingDimension,
        embeddingUseSameCredentials: config.embeddingUseSameCredentials,
        embeddingBaseUrl: config.embeddingBaseUrl,
        embeddingApiKey: config.embeddingApiKey ? '***' + config.embeddingApiKey.slice(-4) : '',
        hasEmbedding: config.embeddingUseSameCredentials ? !!config.openaiApiKey : !!config.embeddingApiKey,
        senseVoiceApiKey: config.senseVoiceApiKey ? '***' + config.senseVoiceApiKey.slice(-4) : '',
        senseVoiceBaseUrl: config.senseVoiceBaseUrl,
        hasVoice: !!config.senseVoiceApiKey,
        capabilities,
      },
    })
  })

  app.get('/api/system-config/ai/providers', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      success: true,
      data: PROVIDER_PRESETS,
    })
  })

  app.post('/api/system-config/ai', ADMIN_ONLY, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = UpdateSchema.parse(req.body)
      const current = getAIConfig()

      // 防止前端把 masking 后的 ***xxxx 重新存回配置文件
      const sensitiveKeys = ['openaiApiKey', 'bingSearchApiKey', 'tavilyApiKey', 'embeddingApiKey', 'senseVoiceApiKey'] as const
      const merged: Partial<typeof body> = { ...body }
      for (const key of sensitiveKeys) {
        const val = body[key]
        if (typeof val === 'string' && val.startsWith('***')) {
          merged[key] = current[key]
        }
      }

      // 记录哪些字段被改了（不含敏感值）
      const changedFields = Object.keys(merged).filter(k => {
        const v = (merged as Record<string, unknown>)[k]
        return v !== undefined && !(typeof v === 'string' && v.startsWith('***'))
      })

      updateAIConfig(merged)

      // 审计日志（critical 级别）
      await logAudit(prisma, ctxFromRequest(req), {
        action: 'CONFIGURE',
        entity: 'AiConfig',
        description: `AI 配置更新（字段：${changedFields.join(', ') || 'none'}）`,
        severity: 'critical',
        changes: { before: Object.fromEntries(changedFields.map(k => [k, current[k as keyof typeof current]])), after: changedFields.reduce((acc, k) => ({ ...acc, [k]: '<updated>' }), {}) },
      })

      reply.send({ success: true })
    } catch (err) {
      reply.status(400).send({ success: false, error: (err as Error).message })
    }
  })

  app.post('/api/system-config/ai/test-embedding', ADMIN_ONLY, async (_req: FastifyRequest, reply: FastifyReply) => {
    const result = await testEmbeddingConnection()
    if (!result.success) {
      throw new AppError(ErrorCode.AI_SERVICE_ERROR, result.message || 'Embedding 连接测试失败', 502)
    }
    reply.send({ success: true, message: result.message, dimension: result.dimension })
  })

  app.post('/api/system-config/ai/test-model', ADMIN_ONLY, async (_req: FastifyRequest, reply: FastifyReply) => {
    const config = getAIConfig()
    if (!config.openaiApiKey) {
      throw new AppError(ErrorCode.AI_SERVICE_ERROR, 'API Key 未配置', 503)
    }

    const baseURL = (config.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    const url = `${baseURL}/chat/completions`

    // 先用原生 fetch 测试，确认不是 Key 问题
    let nativeText = ''
    try {
      const nativeRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: config.modelName,
          messages: [{ role: 'user', content: '请回复：连接成功' }],
          max_tokens: 20,
          temperature: 0,
        }),
      })
      const nativeJson = await nativeRes.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> }
      if (!nativeRes.ok) {
        throw new AppError(
          ErrorCode.AI_SERVICE_ERROR,
          `原生请求失败：${nativeJson.error?.message || nativeRes.statusText}`,
          502,
        )
      }
      nativeText = nativeJson.choices?.[0]?.message?.content || ''
    } catch (err) {
      if (err instanceof AppError) throw err
      throw new AppError(ErrorCode.AI_SERVICE_ERROR, `模型连接测试失败：${(err as Error).message}`, 502)
    }

    // 原生 fetch 成功后再试 AI SDK
    try {
      const userId = (_req.user as { id?: string } | undefined)?.id || 'anonymous'
      const { text } = await llmConcurrencyLimiter.run(userId, () =>
        generateText({
          model: createModel() as unknown as Parameters<typeof generateText>[0]['model'],
          prompt: '请回复：连接成功',
          maxOutputTokens: 20,
          temperature: 0,
        }),
      )
      reply.send({ success: true, message: `连接正常（AI SDK），响应：${text.trim()}` })
    } catch (sdkErr) {
      const sdkMsg = (sdkErr as Error).message || String(sdkErr)
      reply.send({ success: true, message: `原生请求成功：${nativeText.trim()}；但 AI SDK 调用失败：${sdkMsg}` })
    }
  })
}
