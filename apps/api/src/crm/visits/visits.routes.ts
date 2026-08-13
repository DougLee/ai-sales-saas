import type { FastifyInstance } from 'fastify'
import { list, get, create, update, remove, advanceStage, logVisit } from './visits.controller.js'
import { extract, transcribe } from './visits.ai.controller.js'
import { analyzeVisit, getClosure, prep, close, copilotStream } from './visits.analysis.controller.js'

export async function visitsRoutes(app: FastifyInstance) {
  app.get('/', list)
  app.get('/:id', get)
  app.post('/', create)
  app.put('/:id', update)
  app.delete('/:id', remove)
  app.post('/:id/stage', advanceStage)
  app.post('/:id/log', logVisit)
  app.post('/extract', extract)
  app.post('/prep', prep)
  app.post('/:id/analyze', analyzeVisit)
  app.get('/:id/closure', getClosure)
  app.post('/:id/close', close)
  app.post('/transcribe', transcribe)
  app.post('/copilot-stream', copilotStream)
}
