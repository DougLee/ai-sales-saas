import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { DecisionChainService } from './decision-chain.service.js'
import { UpdateDecisionMapSchema } from './decision-chain.schema.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

export async function getDecisionChain(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const prisma = getPrisma(req)
    const service = new DecisionChainService(prisma)
    const data = await service.get(req.params.id)
    reply.send({ success: true, data })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

export async function updateDecisionChain(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const prisma = getPrisma(req)
    const service = new DecisionChainService(prisma)
    const body = UpdateDecisionMapSchema.parse(req.body)
    const data = await service.update(req.params.id, body)
    reply.send({ success: true, data })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
