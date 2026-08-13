import type { FastifyInstance } from 'fastify'
import {
  runSnapshot,
  runAlert,
  runHandover,
  runBriefing,
  getLatestSnapshot,
} from './companion.controller.js'

export async function companionRoutes(app: FastifyInstance) {
  app.post<{ Params: { projectId: string } }>('/snapshot/:projectId', runSnapshot)
  app.post<{ Params: { projectId: string } }>('/alert/:projectId', runAlert)
  app.post<{ Params: { projectId: string } }>('/handover/:projectId', runHandover)
  app.get('/briefing', runBriefing)
  app.get<{ Params: { projectId: string } }>('/snapshot/:projectId/latest', getLatestSnapshot)
}