import { describe, it, expect, vi } from 'vitest'
import { buildOwnerWhere, canAccess, getDepartmentUserIds } from '../../../src/lib/data-scope.js'

function mockUser(role: string, overrides?: Record<string, unknown>) {
  return {
    id: 'user_1',
    tenantId: 'tenant_1',
    orgId: 'org_1',
    role,
    email: 'test@example.com',
    ...overrides,
  }
}

describe('data-scope', () => {
  describe('buildOwnerWhere', () => {
    it('SUPER_ADMIN returns baseWhere only', async () => {
      const result = await buildOwnerWhere({} as never, mockUser('SUPER_ADMIN') as never, { status: 'ACTIVE' })
      expect(result).toEqual({ status: 'ACTIVE' })
    })

    it('TENANT_ADMIN returns baseWhere only', async () => {
      const result = await buildOwnerWhere({} as never, mockUser('TENANT_ADMIN') as never, { status: 'ACTIVE' })
      expect(result).toEqual({ status: 'ACTIVE' })
    })

    it('DEPT_HEAD returns baseWhere + department users + public pool', async () => {
      const findMany = vi.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }])
      const prisma = { user: { findMany } } as never
      const result = await buildOwnerWhere(prisma, mockUser('DEPT_HEAD') as never, { status: 'ACTIVE' })
      expect(result).toEqual({
        status: 'ACTIVE',
        OR: [{ ownerId: { in: ['u1', 'u2'] } }, { ownerId: null }],
      })
      expect(findMany).toHaveBeenCalledWith({ where: { orgId: 'org_1' }, select: { id: true } })
    })

    it('SALES returns baseWhere + ownerId', async () => {
      const result = await buildOwnerWhere({} as never, mockUser('SALES') as never, { status: 'ACTIVE' })
      expect(result).toEqual({ status: 'ACTIVE', ownerId: 'user_1' })
    })

    it('unknown role defaults to SALES behavior', async () => {
      const result = await buildOwnerWhere({} as never, mockUser('VIEWER') as never, { status: 'ACTIVE' })
      expect(result).toEqual({ status: 'ACTIVE', ownerId: 'user_1' })
    })
  })

  describe('getDepartmentUserIds', () => {
    it('returns user ids in the org', async () => {
      const findMany = vi.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }])
      const prisma = { user: { findMany } } as never
      const result = await getDepartmentUserIds(prisma, 'org_1')
      expect(result).toEqual(['u1', 'u2'])
      expect(findMany).toHaveBeenCalledWith({ where: { orgId: 'org_1' }, select: { id: true } })
    })
  })

  describe('canAccess', () => {
    it('SUPER_ADMIN can access any data', async () => {
      expect(await canAccess({} as never, mockUser('SUPER_ADMIN') as never, 'other')).toBe(true)
    })

    it('TENANT_ADMIN can access any data', async () => {
      expect(await canAccess({} as never, mockUser('TENANT_ADMIN') as never, 'other')).toBe(true)
    })

    it('SALES can access own data only', async () => {
      expect(await canAccess({} as never, mockUser('SALES') as never, 'user_1')).toBe(true)
      expect(await canAccess({} as never, mockUser('SALES') as never, 'user_2')).toBe(false)
    })

    it('DEPT_HEAD can access public pool data', async () => {
      expect(await canAccess({} as never, mockUser('DEPT_HEAD') as never, null)).toBe(true)
      expect(await canAccess({} as never, mockUser('DEPT_HEAD') as never, undefined)).toBe(true)
    })

    it('DEPT_HEAD can access same org data', async () => {
      const findUnique = vi.fn().mockResolvedValue({ orgId: 'org_1' })
      const prisma = { user: { findUnique } } as never
      expect(await canAccess(prisma, mockUser('DEPT_HEAD') as never, 'user_2')).toBe(true)
      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'user_2' }, select: { orgId: true } })
    })

    it('DEPT_HEAD cannot access different org data', async () => {
      const findUnique = vi.fn().mockResolvedValue({ orgId: 'org_2' })
      const prisma = { user: { findUnique } } as never
      expect(await canAccess(prisma, mockUser('DEPT_HEAD') as never, 'user_2')).toBe(false)
    })

    it('SALES cannot access public pool', async () => {
      expect(await canAccess({} as never, mockUser('SALES') as never, null)).toBe(false)
    })
  })
})
