import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { update } from '../../../../src/crm/projects/projects.controller.js'

function mockReply() {
  const sent: { statusCode?: number; payload?: unknown } = {}
  return {
    status(code: number) {
      sent.statusCode = code
      return this
    },
    send(payload: unknown) {
      sent.payload = payload
      return this
    },
    getSent: () => sent,
  }
}

function mockRequest(body: unknown, tenantPrisma: PrismaClient) {
  return {
    user: { id: 'user_1', tenantId: 'tenant_1', orgId: 'org_1', role: 'TENANT_ADMIN' },
    tenantPrisma,
    params: { id: 'proj_1' },
    body,
  } as unknown as Parameters<typeof update>[0]
}

function createMockPrisma(existing: Record<string, unknown> | null) {
  return {
    project: {
      findFirst: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue({ id: 'proj_1', name: '测试商机', milestone: existing?.milestone ?? 0 }),
    },
  } as unknown as PrismaClient
}

describe('projects.controller update — 关单后里程碑守卫 (P1-4)', () => {
  it('rejects milestone change with 400 when closedAt is set (won)', async () => {
    const prisma = createMockPrisma({
      ownerId: 'user_1',
      companyId: 'company_1',
      milestone: 7,
      name: '测试商机',
      closedAt: new Date('2026-08-01'),
      status: 'won',
      evidence: {},
    })
    const reply = mockReply()

    await update(mockRequest({ milestone: 8 }, prisma), reply as unknown as Parameters<typeof update>[1])

    const sent = reply.getSent()
    expect(sent.statusCode).toBe(400)
    const payload = sent.payload as { success: boolean; error: string }
    expect(payload.success).toBe(false)
    expect(payload.error).toContain('商机已关单（赢单/流失），不可变更里程碑')
    expect(payload.error).toContain('重新激活')
    // 关单守卫在 gate 校验之前拦截，不应触发任何写库
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  it('rejects milestone rollback with the same closed-deal error (not the backReason error)', async () => {
    const prisma = createMockPrisma({
      ownerId: 'user_1',
      companyId: 'company_1',
      milestone: 5,
      name: '测试商机',
      closedAt: new Date('2026-08-01'),
      status: 'lost',
      evidence: {},
    })
    const reply = mockReply()

    // 带了 backReason：关单守卫仍应优先拦截，而不是落入回退原因校验
    await update(mockRequest({ milestone: 4, backReason: '需求变化' }, prisma), reply as unknown as Parameters<typeof update>[1])

    const payload = reply.getSent().payload as { success: boolean; error: string }
    expect(reply.getSent().statusCode).toBe(400)
    expect(payload.error).toContain('商机已关单')
  })

  it('still allows non-milestone field updates on a closed project', async () => {
    const prisma = createMockPrisma({
      ownerId: 'user_1',
      companyId: 'company_1',
      milestone: 7,
      name: '测试商机',
      closedAt: new Date('2026-08-01'),
      status: 'won',
      evidence: {},
    })
    const reply = mockReply()

    await update(mockRequest({ amount: 50000 }, prisma), reply as unknown as Parameters<typeof update>[1])

    const sent = reply.getSent()
    expect(sent.statusCode).toBe(undefined)
    const payload = sent.payload as { success: boolean }
    expect(payload.success).toBe(true)
    expect(prisma.project.update).toHaveBeenCalled()
  })

  it('allows milestone change when closedAt is null (in-flight project)', async () => {
    const prisma = createMockPrisma({
      ownerId: 'user_1',
      companyId: 'company_1',
      milestone: 0,
      name: '测试商机',
      closedAt: null,
      status: 'following',
      evidence: {},
    })
    // 同请求提交字段 + 里程碑（P0-1）：gate 校验重查 project 拿到旧值，靠 pendingChanges 合并放行
    const findFirst = prisma.project.findFirst as ReturnType<typeof vi.fn>
    findFirst.mockResolvedValueOnce({
      ownerId: 'user_1',
      companyId: 'company_1',
      milestone: 0,
      name: '测试商机',
      closedAt: null,
      status: 'following',
      evidence: {},
    })
    // gate-validator 与 notes 路径的后续重查返回同样的旧状态（humanInfo 仍空）
    const prismaWithGate = {
      project: {
        findFirst: findFirst,
        update: vi.fn().mockResolvedValue({ id: 'proj_1', name: '测试商机', milestone: 1 }),
      },
      methodologyConfig: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      timelineEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaClient

    const reply = mockReply()
    await update(
      mockRequest({ milestone: 1, humanInfo: { firstContact: '电话' } }, prismaWithGate),
      reply as unknown as Parameters<typeof update>[1],
    )

    const sent = reply.getSent()
    const payload = sent.payload as { success: boolean }
    expect(sent.statusCode).toBe(undefined)
    expect(payload.success).toBe(true)
  })
})
