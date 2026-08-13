import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { sessionService } from '../session/session.service.js'

export const authPlugin = fp(async (app: FastifyInstance) => {
  // 全局认证守卫：跳过 health check 和 docs
  app.addHook('onRequest', async (req, reply) => {
    // 公开路径：跳过鉴权
    // 注意：nginx 已配 proxy_pass http://api:3000;（不带末尾 /），所以 /api 前缀保留
    // 实际收到的 req.url 是 /api/auth/register 等
    const publicPaths = ['/health', '/api/health', '/docs', '/api/docs', '/api/docs/', '/api/auth/login', '/api/auth/register']
    if (publicPaths.some((p) => req.url.startsWith(p))) return

    try {
      await req.jwtVerify()
      const payload = req.user as { id?: string; tenantId?: string; email?: string } | undefined
      if (payload?.id) {
        const valid = await sessionService.validateSession(payload.id, req.headers.authorization?.replace('Bearer ', '') || '')
        if (!valid) {
          return reply.status(401).send({
            success: false,
            error: { code: 'SESSION_EXPIRED', message: '登录已过期或在其他设备登录' },
          })
        }
      }
    } catch {
      reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: '请先登录' },
      })
    }
  })
})
