import type { FastifyInstance } from 'fastify'
import { chat, listSessions, getSessionMessages, deleteSession, audit } from './chat.controller.js'
import { enrollBulk } from './enroll.controller.js'

export async function chatRoutes(app: FastifyInstance) {
  app.post('/', chat)
  app.post('/audit', audit)
  app.post('/enroll-bulk', enrollBulk)
  app.get('/sessions', listSessions)
  app.get('/sessions/:id/messages', getSessionMessages)
  app.delete('/sessions/:id', deleteSession)
}
