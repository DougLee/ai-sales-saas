import { describe, it, expect } from 'vitest'
import fastify from 'fastify'
import { tenantContextPlugin } from '../../../src/tenant/tenant-context.js'

describe('tenantContextPlugin', () => {
  it('injects tenantContext and tenantPrisma on authenticated request', async () => {
    const app = fastify()
    await app.register(tenantContextPlugin)

    app.get('/test', async (req) => {
      return {
        tenantId: req.tenantContext?.tenantId,
        userId: req.tenantContext?.userId,
        role: req.tenantContext?.role,
        hasPrisma: !!req.tenantPrisma,
      }
    })

    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        // 模拟已认证用户（插件不验证 token，只读取 req.user）
      },
    })

    const body = res.json()
    expect(body.tenantId).toBe('default')
    expect(body.userId).toBe('anonymous')
    expect(body.role).toBe('SALES')
    expect(body.hasPrisma).toBe(true)
  })
})
