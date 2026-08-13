import type { FastifyInstance } from 'fastify'
import { list, get, create } from './methodology.controller.js'

export async function methodologyRoutes(app: FastifyInstance) {
  app.get('/', list)
  app.get('/detail', get)
  app.post('/', create)
}
