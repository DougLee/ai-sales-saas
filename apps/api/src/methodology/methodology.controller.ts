import type { FastifyRequest, FastifyReply } from 'fastify'
import { MethodologyService } from './methodology.service.js'
import { MethodologyConfigSchema } from '@ai-sales/shared'
import { prisma } from '../config/database.js'

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const tenantId = (req.user as { tenantId?: string } | undefined)?.tenantId || ''
    const service = new MethodologyService(prisma)
    const configs = await service.list(tenantId)
    reply.send({ success: true, data: configs })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function get(req: FastifyRequest<{ Querystring: { moduleType: string } }>, reply: FastifyReply) {
  try {
    const tenantId = (req.user as { tenantId?: string } | undefined)?.tenantId || ''
    const moduleType = req.query.moduleType
    const service = new MethodologyService(prisma)
    const config = await service.get(tenantId, moduleType)
    reply.send({ success: true, data: config })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const tenantId = (req.user as { tenantId?: string } | undefined)?.tenantId || ''
    const body = MethodologyConfigSchema.parse(req.body)
    const service = new MethodologyService(prisma)
    const config = await service.create(tenantId, body)
    reply.send({ success: true, data: config })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
