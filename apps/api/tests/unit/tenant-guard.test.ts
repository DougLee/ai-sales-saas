import { describe, it, expect, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import {
  buildWhereClause,
  withTenantIsolation,
  createTenantPrisma,
  type TenantUser,
} from '../../src/tenant/tenant-guard.js'

const mockUser = (role: TenantUser['role'], orgId = 'org_1'): TenantUser => ({
  id: 'user_1',
  tenantId: 'tenant_1',
  orgId,
  role,
})

describe('tenant-guard', () => {
  describe('buildWhereClause', () => {
    it('TENANT_ADMIN should only filter by tenantId', () => {
      const where = buildWhereClause(mockUser('TENANT_ADMIN'), 'project')
      expect(where).toEqual({ tenantId: 'tenant_1' })
    })

    it('DEPT_HEAD should filter TimelineEvent by orgId', () => {
      const where = buildWhereClause(mockUser('DEPT_HEAD'), 'timelineEvent')
      expect(where).toEqual({ tenantId: 'tenant_1', orgId: 'org_1' })
    })

    it('DEPT_HEAD should filter project by orgId', () => {
      const where = buildWhereClause(mockUser('DEPT_HEAD'), 'project')
      expect(where).toEqual({ tenantId: 'tenant_1', orgId: 'org_1' })
    })

    it('SALES should filter Project by ownerId', () => {
      const where = buildWhereClause(mockUser('SALES'), 'project')
      expect(where).toEqual({ tenantId: 'tenant_1', ownerId: 'user_1' })
    })

    it('SALES should filter TimelineEvent by ownerId', () => {
      const where = buildWhereClause(mockUser('SALES'), 'timelineEvent')
      expect(where).toEqual({ tenantId: 'tenant_1', ownerId: 'user_1' })
    })

    it('SALES should filter KbDocument by uploadedBy', () => {
      const where = buildWhereClause(mockUser('SALES'), 'kbDocument')
      expect(where).toEqual({ tenantId: 'tenant_1', uploadedBy: 'user_1' })
    })
  })

  describe('withTenantIsolation', () => {
    it('should merge existing where with tenant isolation using AND', () => {
      const result = withTenantIsolation(mockUser('SALES'), { milestone: 2 }, 'project')
      expect(result).toEqual({
        milestone: 2,
        AND: [
          { milestone: 2 },
          { tenantId: 'tenant_1', ownerId: 'user_1' },
        ],
      })
    })
  })

  describe('createTenantPrisma', () => {
    it('should inject tenant isolation into findMany', async () => {
      const findMany = vi.fn().mockResolvedValue([])
      const mockPrisma = {
        project: { findMany },
      } as unknown as PrismaClient

      const tenantPrisma = createTenantPrisma(mockPrisma, mockUser('SALES'))
      await tenantPrisma.project.findMany({ where: { milestone: 2 } })

      expect(findMany).toHaveBeenCalledWith({
        where: {
          milestone: 2,
          AND: [
            { milestone: 2 },
            { tenantId: 'tenant_1', ownerId: 'user_1' },
          ],
        },
      })
    })

    it('should inject tenantId, ownerId and orgId on create', async () => {
      const create = vi.fn().mockResolvedValue({})
      const mockPrisma = {
        project: { create },
      } as unknown as PrismaClient

      const tenantPrisma = createTenantPrisma(mockPrisma, mockUser('SALES'))
      await tenantPrisma.project.create({ data: { name: 'Test Project' } })

      expect(create).toHaveBeenCalledWith({
        data: {
          name: 'Test Project',
          tenantId: 'tenant_1',
          ownerId: 'user_1',
          orgId: 'org_1',
        },
      })
    })

    it('should inject tenantId, ownerId and orgId on TimelineEvent create', async () => {
      const create = vi.fn().mockResolvedValue({})
      const mockPrisma = {
        timelineEvent: { create },
      } as unknown as PrismaClient

      const tenantPrisma = createTenantPrisma(mockPrisma, mockUser('SALES'))
      await tenantPrisma.timelineEvent.create({ data: { eventType: 'visit.voice_raw' } })

      expect(create).toHaveBeenCalledWith({
        data: {
          eventType: 'visit.voice_raw',
          tenantId: 'tenant_1',
          ownerId: 'user_1',
          orgId: 'org_1',
        },
      })
    })

    it('should use findFirst for findUnique to support AND conditions', async () => {
      const findFirst = vi.fn().mockResolvedValue(null)
      const mockPrisma = {
        project: { findFirst, findUnique: vi.fn() },
      } as unknown as PrismaClient

      const tenantPrisma = createTenantPrisma(mockPrisma, mockUser('SALES'))
      await tenantPrisma.project.findUnique({ where: { id: 'proj_1' } })

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: 'proj_1',
          tenantId: 'tenant_1',
          ownerId: 'user_1',
        },
      })
    })

    it('should reject cross-tenant findUnique', async () => {
      const findFirst = vi.fn().mockResolvedValue(null)
      const mockPrisma = {
        project: { findFirst, findUnique: vi.fn() },
      } as unknown as PrismaClient

      const tenantPrisma = createTenantPrisma(mockPrisma, mockUser('SALES'))
      await tenantPrisma.project.findUnique({ where: { id: 'other_tenant_project' } })

      // findFirst should be called with tenantId + ownerId filter
      const callArg = findFirst.mock.calls[0][0]
      expect(callArg.where).toEqual({
        id: 'other_tenant_project',
        tenantId: 'tenant_1',
        ownerId: 'user_1',
      })
    })
  })
})
