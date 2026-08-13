import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useHasRole, useIsAdmin, useCanAssign } from './use-permission.js'

const mockUseAuthUser = vi.fn()

vi.mock('./use-auth.js', () => ({
  useAuthUser: () => mockUseAuthUser(),
}))

describe('use-permission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('useHasRole returns false when no user', () => {
    mockUseAuthUser.mockReturnValue({ data: undefined })
    expect(useHasRole('TENANT_ADMIN')).toBe(false)
  })

  it('useHasRole returns true when role matches', () => {
    mockUseAuthUser.mockReturnValue({ data: { role: 'DEPT_HEAD' } })
    expect(useHasRole('DEPT_HEAD', 'TENANT_ADMIN')).toBe(true)
  })

  it('useHasRole returns false when role does not match', () => {
    mockUseAuthUser.mockReturnValue({ data: { role: 'SALES' } })
    expect(useHasRole('TENANT_ADMIN')).toBe(false)
  })

  it('useIsAdmin is true for TENANT_ADMIN', () => {
    mockUseAuthUser.mockReturnValue({ data: { role: 'TENANT_ADMIN' } })
    expect(useIsAdmin()).toBe(true)
  })

  it('useIsAdmin is true for SUPER_ADMIN', () => {
    mockUseAuthUser.mockReturnValue({ data: { role: 'SUPER_ADMIN' } })
    expect(useIsAdmin()).toBe(true)
  })

  it('useIsAdmin is false for SALES', () => {
    mockUseAuthUser.mockReturnValue({ data: { role: 'SALES' } })
    expect(useIsAdmin()).toBe(false)
  })

  it('useCanAssign allows DEPT_HEAD', () => {
    mockUseAuthUser.mockReturnValue({ data: { role: 'DEPT_HEAD' } })
    expect(useCanAssign()).toBe(true)
  })

  it('useCanAssign denies SALES', () => {
    mockUseAuthUser.mockReturnValue({ data: { role: 'SALES' } })
    expect(useCanAssign()).toBe(false)
  })
})
