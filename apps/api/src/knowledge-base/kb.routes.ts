import type { FastifyInstance } from 'fastify'
import { uploadFiles, listFiles, analyzeFile, removeFile, embedFile, searchFiles } from './kb.controller.js'

export async function kbRoutes(app: FastifyInstance) {
  app.get('/files', listFiles)
  app.post('/files/upload', uploadFiles)
  app.post('/files/:id/analyze', analyzeFile)
  app.post('/files/:id/embed', embedFile)
  app.get('/search', searchFiles)
  app.delete('/files/:id', removeFile)
}
