import type { FastifyInstance } from 'fastify'
import { getDataQualitySummary } from './data-quality.controller.js'

export async function dataQualityRoutes(app: FastifyInstance) {
  app.get('/summary', getDataQualitySummary)
}
