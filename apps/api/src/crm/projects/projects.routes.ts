import type { FastifyInstance } from 'fastify'
import { list, get, create, update, remove, timeline, pipeline } from './projects.controller.js'
import { projectMetrics } from './projects.derivation.service.js'
import { getDecisionChain, updateDecisionChain } from './decision-chain.controller.js'
import { markWaiting, clearWaiting } from './waiting.controller.js'
import { listByProject } from '../activities/activities.controller.js'

export async function projectsRoutes(app: FastifyInstance) {
  app.get('/', list)
  app.get('/pipeline', pipeline)
  app.get('/metrics', projectMetrics)
  app.get('/:id', get)
  app.post('/', create)
  app.put('/:id', update)
  app.delete('/:id', remove)
  app.get('/:id/timeline', timeline)
  app.get('/:id/activities', listByProject)
  app.get('/:id/decision-chain', getDecisionChain)
  app.put('/:id/decision-chain', updateDecisionChain)
  app.put('/:id/waiting', markWaiting)
  app.delete('/:id/waiting', clearWaiting)
}
