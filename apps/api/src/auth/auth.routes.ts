import type { FastifyInstance } from 'fastify'
import { register, login, me, logout } from './auth.controller.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', register)
  app.post('/login', login)
  app.get('/me', { preHandler: [async (req) => { await req.jwtVerify() }] }, me)
  app.post('/logout', { preHandler: [async (req) => { await req.jwtVerify() }] }, logout)
}
