import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { withDataFoundation } from '../../../src/infra/prisma-extensions.js'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Captured {
  query: Record<string, Record<string, (params: any) => Promise<unknown>>>
}

function makeFakeClient(log: unknown[][]) {
  const captured: Captured = { query: {} }
  const fake = {
    $extends: (ext: { query: Record<string, unknown> }) => {
      captured.query = ext.query as Captured['query']
      return 'EXTENDED'
    },
    visit: {
      updateMany: async (args: unknown) => {
        log.push(['visit.updateMany', args])
        return { count: 1 }
      },
    },
    auditLog: {
      create: async (args: unknown) => {
        log.push(['auditLog.create', args])
        return {}
      },
    },
    project: { findUnique: async () => ({ id: 'p1' }) },
    company: { findUnique: async () => ({ id: 'c1' }) },
    lead: { findUnique: async () => ({ id: 'l1' }) },
  }
  return { fake: fake as unknown as PrismaClient, captured }
}

describe('prisma-extensions（#33 A3 审计 + A2 软删级联）', () => {
  it('create：自动写 AuditLog（tenantId 取自结果行）', async () => {
    const log: unknown[][] = []
    const { fake, captured } = makeFakeClient(log)
    const extended = withDataFoundation(fake)
    expect(extended).toBe('EXTENDED' as never)

    const result = await captured.query.company.create({
      args: { data: { tenantId: 't1', name: '河南科技学院' } },
      query: async () => ({ id: 'c9', tenantId: 't1', name: '河南科技学院' }),
    })
    expect(result).toMatchObject({ id: 'c9' })
    expect(log).toHaveLength(1)
    const [kind, args] = log[0] as [string, { data: Record<string, unknown> }]
    expect(kind).toBe('auditLog.create')
    expect(args.data).toMatchObject({
      tenantId: 't1', action: 'CREATE', entity: 'Company', entityId: 'c9',
      ip: 'prisma-extension', metadata: { via: 'prisma-extension' },
    })
  })

  it('update：软删父实体 → 级联软删关联 Visit + 审计只记字段名', async () => {
    const log: unknown[][] = []
    const { fake, captured } = makeFakeClient(log)
    withDataFoundation(fake)

    await captured.query.project.update({
      args: { where: { id: 'p1' }, data: { deletedAt: new Date('2026-08-16T00:00:00Z') } },
      query: async () => ({ id: 'p1', tenantId: 't1', name: '商机A' }),
    })

    const cascade = log.find(([k]) => k === 'visit.updateMany')
    expect(cascade).toBeTruthy()
    expect((cascade![1] as { where: Record<string, unknown> }).where).toMatchObject({ projectId: 'p1', deletedAt: null })

    const audit = log.find(([k]) => k === 'auditLog.create')
    expect((audit![1] as { data: { action: string; entity: string; metadata: { updatedFields?: string[] } } }).data).toMatchObject({
      action: 'UPDATE', entity: 'Project', metadata: { via: 'prisma-extension', updatedFields: ['deletedAt'] },
    })
  })

  it('update：普通更新不触发 Visit 级联', async () => {
    const log: unknown[][] = []
    const { fake, captured } = makeFakeClient(log)
    withDataFoundation(fake)
    await captured.query.company.update({
      args: { where: { id: 'c1' }, data: { name: '新名字' } },
      query: async () => ({ id: 'c1', tenantId: 't1', name: '新名字' }),
    })
    expect(log.find(([k]) => k === 'visit.updateMany')).toBeUndefined()
    expect(log.find(([k]) => k === 'auditLog.create')).toBeTruthy()
  })

  it('delete：先级联软删 Visit 再执行删除，最后审计', async () => {
    const order: string[] = []
    const captured: Captured = { query: {} }
    const fake = {
      $extends: (ext: { query: unknown }) => {
        captured.query = ext.query as Captured['query']
        return 'EXTENDED'
      },
      visit: { updateMany: async () => (order.push('cascade'), { count: 2 }) },
      auditLog: { create: async () => (order.push('audit'), {}) },
      lead: { findUnique: async () => ({ id: 'l1' }) },
    }
    withDataFoundation(fake as unknown as PrismaClient)
    await captured.query.lead.delete({
      args: { where: { id: 'l1' } },
      query: async () => (order.push('delete'), { id: 'l1', tenantId: 't1' }),
    })
    expect(order).toEqual(['cascade', 'delete', 'audit'])
  })

  it('级联失败不阻塞主流程；审计失败不阻塞主流程', async () => {
    // 级联抛错
    let captured: Captured = { query: {} }
    let fake: unknown = {
      $extends: (ext: { query: unknown }) => (captured.query = ext.query as Captured['query'], 'EXTENDED'),
      visit: { updateMany: async () => { throw new Error('boom') } },
      auditLog: { create: async () => ({}) },
    }
    withDataFoundation(fake as PrismaClient)
    const r1 = await captured.query.project.update({
      args: { where: { id: 'p1' }, data: { deletedAt: new Date() } },
      query: async () => ({ id: 'p1', tenantId: 't1' }),
    })
    expect(r1).toMatchObject({ id: 'p1' })

    // 审计抛错（logAudit 内部 catch，console.error）
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    captured = { query: {} }
    fake = {
      $extends: (ext: { query: unknown }) => (captured.query = ext.query as Captured['query'], 'EXTENDED'),
      visit: { updateMany: async () => ({ count: 0 }) },
      auditLog: { create: async () => { throw new Error('audit down') } },
    }
    withDataFoundation(fake as PrismaClient)
    const r2 = await captured.query.project.update({
      args: { where: { id: 'p1' }, data: { name: 'x' } },
      query: async () => ({ id: 'p1', tenantId: 't1' }),
    })
    expect(r2).toMatchObject({ id: 'p1' })
    errSpy.mockRestore()
  })

  it('无 tenantId 的结果行不写审计（logAudit 口径）', async () => {
    const log: unknown[][] = []
    const { fake, captured } = makeFakeClient(log)
    withDataFoundation(fake)
    await captured.query.company.update({
      args: { where: { id: 'c1' }, data: { name: 'x' } },
      query: async () => ({ id: 'c1', tenantId: null, name: 'x' }),
    })
    expect(log).toHaveLength(0)
  })
})
