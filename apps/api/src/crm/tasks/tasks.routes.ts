import type { FastifyInstance } from 'fastify'
import { list, get, create, update, complete, remove } from './tasks.controller.js'

export async function tasksRoutes(app: FastifyInstance) {
  app.get('/', list)
  app.get('/:id', get)
  app.post('/', create)
  app.put('/:id', update)
  app.patch('/:id/complete', complete)
  app.delete('/:id', remove)
}
