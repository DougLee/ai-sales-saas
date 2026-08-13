import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

export async function enrollBulk(req: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = getPrisma(req)
    const body = req.body as {
      accounts?: Array<Record<string, unknown>>
      leads?: Array<Record<string, unknown>>
      projects?: Array<Record<string, unknown>>
      contacts?: Array<Record<string, unknown>>
    }

    const result: Record<string, Array<Record<string, unknown>>> = {
      accounts: [],
      leads: [],
      projects: [],
      contacts: [],
    }
    const summary = { accounts: { success: 0, failed: 0 }, leads: { success: 0, failed: 0 }, projects: { success: 0, failed: 0 }, contacts: { success: 0, failed: 0 } }

    if (body.accounts?.length) {
      for (const item of body.accounts) {
        try {
          const created = await prisma.company.create({
            data: item as never,
          })
          result.accounts.push(created as Record<string, unknown>)
          summary.accounts.success++
        } catch {
          summary.accounts.failed++
        }
      }
    }

    if (body.leads?.length) {
      for (const item of body.leads) {
        try {
          const created = await prisma.lead.create({
            data: item as never,
          })
          result.leads.push(created as Record<string, unknown>)
          summary.leads.success++
        } catch {
          summary.leads.failed++
        }
      }
    }

    if (body.projects?.length) {
      for (const item of body.projects) {
        try {
          const created = await prisma.project.create({
            data: item as never,
          })
          result.projects.push(created as Record<string, unknown>)
          summary.projects.success++
        } catch {
          summary.projects.failed++
        }
      }
    }

    if (body.contacts?.length) {
      for (const item of body.contacts) {
        try {
          const created = await prisma.contact.create({
            data: item as never,
          })
          result.contacts.push(created as Record<string, unknown>)
          summary.contacts.success++
        } catch {
          summary.contacts.failed++
        }
      }
    }

    reply.send({ success: true, result, summary })
  } catch (err) {
    reply.status(500).send({ success: false, error: (err as Error).message })
  }
}
