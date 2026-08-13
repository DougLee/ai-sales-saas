import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { customerCompanion, type CompanionMode } from './customer-companion.js'
import { getEffectiveSnapshot } from '../../crm/snapshots/snapshot.service.js'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getTenantId(req: FastifyRequest): string {
  const user = req.user as { tenantId?: string } | undefined
  return user?.tenantId || 'default'
}

function getUserId(req: FastifyRequest): string {
  const user = req.user as { id?: string } | undefined
  return user?.id || 'anonymous'
}

interface ProjectParams {
  projectId: string
}

async function runForProject(
  req: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
  mode: CompanionMode,
) {
  try {
    const prisma = getPrisma(req)
    const tenantId = getTenantId(req)
    const result = await customerCompanion(prisma, {
      mode,
      tenantId,
      projectId: req.params.projectId,
    })
    reply.send({ success: true, data: result })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function runSnapshot(
  req: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  return runForProject(req, reply, 'snapshot')
}

export async function runAlert(
  req: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  return runForProject(req, reply, 'alert')
}

export async function runHandover(
  req: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  return runForProject(req, reply, 'handover')
}

export async function runBriefing(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const tenantId = getTenantId(req)
    const userId = getUserId(req)
    const result = await customerCompanion(prisma, {
      mode: 'briefing',
      tenantId,
      userId,
    })
    reply.send({ success: true, data: result })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}

export async function getLatestSnapshot(
  req: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  try {
    const prisma = getPrisma(req)
    const result = await getEffectiveSnapshot(prisma, req.params.projectId)
    reply.send({ success: true, data: result })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}