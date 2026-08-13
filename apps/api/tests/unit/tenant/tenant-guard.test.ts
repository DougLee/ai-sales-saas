import { describe, it, expect } from 'vitest'
import { buildWhereClause, withTenantIsolation } from '@/tenant/tenant-guard'
import type { TenantUser } from '@/tenant/tenant-guard'

function makeUser(role: TenantUser['role'], overrides?: Partial<TenantUser>): TenantUser {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    orgId: 'org-1',
    role,
    ...overrides,
  }
}

describe('buildWhereClause', () => {
  it('SUPER_ADMIN sees all tenant data', () => {
    const where = buildWhereClause(makeUser('SUPER_ADMIN'))
    expect(where).toEqual({ tenantId: 'tenant-1' })
  })

  it('TENANT_ADMIN sees all tenant data', () => {
    const where = buildWhereClause(makeUser('TENANT_ADMIN'))
    expect(where).toEqual({ tenantId: 'tenant-1' })
  })

  it('DEPT_HEAD sees org-scoped data for org-aware models', () => {
    const where = buildWhereClause(makeUser('DEPT_HEAD'), 'project')
    expect(where).toEqual({ tenantId: 'tenant-1', orgId: 'org-1' })
  })

  it('DEPT_HEAD sees all tenant data for models without orgId', () => {
    const where = buildWhereClause(makeUser('DEPT_HEAD'), 'company')
    expect(where).toEqual({ tenantId: 'tenant-1' })
  })

  it('SALES only sees own data for owner-scoped models', () => {
    const where = buildWhereClause(makeUser('SALES'), 'project')
    expect(where).toEqual({ tenantId: 'tenant-1', ownerId: 'user-1' })
  })

  it('VIEWER only sees own data for owner-scoped models', () => {
    const where = buildWhereClause(makeUser('VIEWER'), 'project')
    expect(where).toEqual({ tenantId: 'tenant-1', ownerId: 'user-1' })
  })

  it('defaults to owner-scoped for unknown roles on owner-scoped models', () => {
    const where = buildWhereClause(makeUser('SALES'), 'lead')
    expect(where).toHaveProperty('ownerId')
  })
})

describe('withTenantIsolation', () => {
  it('merges base where with tenant clause for owner-scoped models', () => {
    const user = makeUser('SALES')
    const result = withTenantIsolation(user, { status: 'ACTIVE' }, 'project')
    expect(result.AND).toHaveLength(2)
    expect(result.AND[0]).toEqual({ status: 'ACTIVE' })
    expect(result.AND[1]).toEqual({ tenantId: 'tenant-1', ownerId: 'user-1' })
  })

  it('works with empty base where', () => {
    const user = makeUser('TENANT_ADMIN')
    const result = withTenantIsolation(user)
    expect(result.AND[0]).toEqual({})
    expect(result.AND[1]).toEqual({ tenantId: 'tenant-1' })
  })

  it('preserves base where properties', () => {
    const user = makeUser('SUPER_ADMIN')
    const result = withTenantIsolation(user, { name: { contains: 'test' }, stage: 'BID' })
    expect(result.name).toBeDefined()
    expect(result.stage).toBe('BID')
  })
})
