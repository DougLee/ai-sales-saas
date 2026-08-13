import type { FastifyInstance } from 'fastify'
import { getAlerts, getUnreadCount, triggerScan, markRead, markAllRead } from './alert.controller.js'

export async function alertRoutes(app: FastifyInstance) {
  app.get('/', getAlerts)
  app.get('/unread-count', getUnreadCount)
  app.post('/scan', triggerScan)
  app.post('/:id/read', markRead)
  app.post('/read-all', markAllRead)
}
