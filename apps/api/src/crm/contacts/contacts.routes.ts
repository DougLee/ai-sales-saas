import type { FastifyInstance } from 'fastify'
import { list, get, create, update, remove } from './contacts.controller.js'

export async function contactsRoutes(app: FastifyInstance) {
  app.get('/', list)
  app.get('/:id', get)
  app.post('/', create)
  app.put('/:id', update)
  app.delete('/:id', remove)
}
