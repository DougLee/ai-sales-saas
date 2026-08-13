import type { FastifyInstance } from 'fastify'
import { getSample, submit, deviationReport } from './spot-check.controller.js'

export async function spotCheckRoutes(app: FastifyInstance) {
  app.get('/sample', getSample)
  app.post('/:closureId', submit)
  app.get('/deviation-report', deviationReport)
}
