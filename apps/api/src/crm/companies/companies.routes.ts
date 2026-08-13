import type { FastifyInstance } from 'fastify'
import { list, get, create, update, remove, claim, assign, updateStatus, duplicates, missingFields, changeHistory, merge } from './companies.controller.js'
import { listByCustomer } from '../activities/activities.controller.js'

export async function companiesRoutes(app: FastifyInstance) {
  app.get('/', list)
  app.get('/duplicates', duplicates)
  app.get('/:id', get)
  app.get('/:id/activities', listByCustomer)
  app.get('/:id/missing-fields', missingFields)
  app.get('/:id/history', changeHistory)
  app.post('/', create)
  app.put('/:id', update)
  app.put('/:id/status', updateStatus)
  app.delete('/:id', remove)
  app.post('/:id/claim', claim)
  app.post('/:id/assign', assign)
  app.post('/:id/merge', merge)
}
