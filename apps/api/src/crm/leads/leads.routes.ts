import type { FastifyInstance } from 'fastify'
import {
  list,
  get,
  create,
  update,
  remove,
  convert,
  followUp,
  score,
  assess,
  getAssessmentJob,
  lose,
  timeline,
  followUps,
} from './leads.controller.js'
import { leadMetrics } from './leads.derivation.service.js'

export async function leadsRoutes(app: FastifyInstance) {
  app.get('/', list)
  app.get('/metrics', leadMetrics)
  app.get('/:id', get)
  app.post('/', create)
  app.put('/:id', update)
  app.delete('/:id', remove)
  app.post('/:id/convert', convert)
  app.post('/:id/follow-up', followUp)
  app.get('/:id/follow-ups', followUps)
  app.post('/:id/score', score)
  app.post('/:id/assess', assess)
  app.get('/:id/assessment-jobs/:jobId', getAssessmentJob)
  app.post('/:id/lose', lose)
  app.get('/:id/timeline', timeline)
}
