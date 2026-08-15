import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * P1-3：VIEWER 全局只读守卫
 *
 * 挂在 authPlugin 之后（req.user 已由 JWT 解出）：
 * 写方法 + VIEWER 角色 + /api/ 业务路由（/api/auth 除外，登录登出不拦）→ 403。
 * data-scope.ts 只做行级过滤不做角色写拦截，此前的实测 VIEWER 可 POST/DELETE 业务数据。
 */
export async function viewerReadOnlyHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!WRITE_METHODS.has(req.method)) return
  if (!req.url.startsWith('/api/') || req.url.startsWith('/api/auth')) return

  const user = req.user as { role?: string } | undefined
  if (!user || user.role !== 'VIEWER') return

  return reply.status(403).send({ success: false, error: '只读账号无写权限' }) as unknown as void
}

export const viewerReadOnlyPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', viewerReadOnlyHook)
})
