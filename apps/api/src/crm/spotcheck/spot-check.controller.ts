import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { sampleWeeklySpotCheck, recordSpotCheck, getDeviationReport, getWeekStart } from './spot-check.service.js'

/**
 * 管理者抽检接口（V6.1 §6.1.5）
 * 仅管理角色可访问（SUPER_ADMIN / TENANT_ADMIN / DEPT_HEAD）
 */

const MANAGER_ROLES = new Set(['SUPER_ADMIN', 'TENANT_ADMIN', 'DEPT_HEAD'])

function getPrisma(req: FastifyRequest): PrismaClient {
  return req.tenantPrisma!
}

function getUser(req: FastifyRequest) {
  return req.user as { id: string; tenantId: string; role: string }
}

function assertManager(req: FastifyRequest, reply: FastifyReply): boolean {
  const user = getUser(req)
  if (!MANAGER_ROLES.has(user.role)) {
    reply.status(403).send({ success: false, error: '仅管理者可使用抽检功能' })
    return false
  }
  return true
}

/**
 * GET /api/spot-check/sample?weekStart=2026-08-03
 * 本周应抽检清单（默认取上周闭环拜访的 10% 分层抽样）
 */
export async function getSample(req: FastifyRequest<{ Querystring: { weekStart?: string } }>, reply: FastifyReply) {
  if (!assertManager(req, reply)) return
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const weekStart = req.query.weekStart ? new Date(req.query.weekStart) : undefined
    const sample = await sampleWeeklySpotCheck(prisma, user.tenantId, { weekStart })
    reply.send({
      success: true,
      data: {
        weekStart: (weekStart || new Date(getWeekStart().getTime() - 7 * 86400000)).toISOString().slice(0, 10),
        sampleSize: sample.length,
        items: sample,
      },
    })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}

const RecordSchema = z.object({
  managerScore: z.number().min(0).max(100),
  comment: z.string().max(1000).optional(),
})

/**
 * POST /api/spot-check/:closureId — 管理者提交抽检评分（与 rubric 同量纲 0-100）
 */
export async function submit(req: FastifyRequest<{ Params: { closureId: string } }>, reply: FastifyReply) {
  if (!assertManager(req, reply)) return
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const body = RecordSchema.parse(req.body)

    const closure = await recordSpotCheck(prisma, {
      closureId: req.params.closureId,
      managerId: user.id,
      managerScore: body.managerScore,
      comment: body.comment,
    })
    reply.send({ success: true, data: closure })
  } catch (err) {
    const msg = (err as Error).message
    if (msg === '闭环记录不存在') return reply.status(404).send({ success: false, error: msg })
    if (msg === '该拜访已抽检过') return reply.status(409).send({ success: false, error: msg })
    reply.status(400).send({ success: false, error: msg })
  }
}

/**
 * GET /api/spot-check/deviation-report?weeks=4
 * 偏差报告：|管理者分 - rubric分| > 15 的校准清单 + 一致率（验收线 ≥80%）
 */
export async function deviationReport(req: FastifyRequest<{ Querystring: { weeks?: string } }>, reply: FastifyReply) {
  if (!assertManager(req, reply)) return
  try {
    const prisma = getPrisma(req)
    const user = getUser(req)
    const weeks = req.query.weeks ? Number(req.query.weeks) : undefined
    const report = await getDeviationReport(prisma, user.tenantId, { weeks })
    reply.send({ success: true, data: report })
  } catch (err) {
    reply.status(400).send({ success: false, error: (err as Error).message })
  }
}
