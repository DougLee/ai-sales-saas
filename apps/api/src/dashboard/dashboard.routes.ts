import type { FastifyInstance } from 'fastify'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { getStats, getMe } from './dashboard.controller.js'
import { getTeamRanking } from './team-ranking.service.js'
import { generateBriefing } from '../agents/workflows/briefing.js'
import { skillRegistry } from '../agents/skills/index.js'

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/stats', getStats)
  app.get('/me', getMe)

  // V6.1 §6.2：团队轻量排名（WQMI 周排名 + 趋势 + 分数构成透明）
  app.get('/team-ranking', async (req: FastifyRequest<{ Querystring: { weekStart?: string } }>, reply: FastifyReply) => {
    try {
      const user = req.user as { tenantId?: string } | undefined
      const weekStart = req.query.weekStart ? new Date(req.query.weekStart) : undefined
      const data = await getTeamRanking(req.tenantPrisma!, {
        tenantId: user?.tenantId || 'default',
        weekStart,
      })
      reply.send({ success: true, data })
    } catch (err) {
      reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  app.get('/briefing', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as { id?: string; tenantId?: string } | undefined
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'

    try {
      const briefing = await generateBriefing(req.tenantPrisma!, tenantId, userId)

      reply.send({
        success: true,
        data: briefing,
      })
    } catch (err) {
      req.log.error({ err, userId, tenantId }, 'Briefing generation failed')
      reply.status(500).send({
        success: false,
        error: '简报生成失败，请稍后重试',
      })
    }
  })

  app.get('/recommendations', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as { id?: string; tenantId?: string; orgId?: string; role?: string } | undefined
    const tenantId = user?.tenantId || 'default'
    const userId = user?.id || 'anonymous'
    const orgId = user?.orgId
    const role = user?.role || 'SALES'

    try {
      const result = await skillRegistry.execute(
        'proactive-recommendations',
        { userId },
        {
          prisma: req.tenantPrisma!,
          tenantId,
          userId,
          orgId,
          role,
        },
      )

      if (!result.success) {
        return reply.status(500).send({
          success: false,
          error: result.error?.message || '推荐生成失败',
        })
      }

      reply.send({
        success: true,
        data: result.data,
      })
    } catch (err) {
      req.log.error({ err, userId, tenantId }, 'Recommendations generation failed')
      reply.status(500).send({
        success: false,
        error: '推荐生成失败，请稍后重试',
      })
    }
  })
}
