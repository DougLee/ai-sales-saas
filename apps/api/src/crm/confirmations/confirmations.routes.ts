import type { FastifyInstance } from 'fastify'
import { list, resolve, batch } from './confirmations.controller.js'

export async function confirmationsRoutes(app: FastifyInstance) {
  app.get('/', list)
  app.post('/:id/resolve', resolve)
  app.post('/batch-confirm', batch)
}
