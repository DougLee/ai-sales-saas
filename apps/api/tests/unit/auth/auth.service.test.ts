import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from '../../../src/auth/auth.service.js'
import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}))

vi.mock('../../../src/session/session.service.js', () => ({
  sessionService: {
    createSession: vi.fn().mockResolvedValue({}),
  },
}))

function createMockPrisma(overrides?: Record<string, unknown>) {
  return {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    },
    tenant: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    org: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    methodologyConfig: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    ...overrides,
  } as unknown as PrismaClient
}

function createMockJwt() {
  return { sign: vi.fn().mockReturnValue('jwt-token') } as unknown as Parameters<typeof AuthService>[1]
}

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('register', () => {
    it('creates user with existing tenant and org', async () => {
      const prisma = createMockPrisma()
      const jwt = createMockJwt()
      const service = new AuthService(prisma, jwt)

      prisma.user.findFirst = vi.fn().mockResolvedValue(null)
      prisma.tenant.findFirst = vi.fn().mockResolvedValue({ id: 'tenant-1' })
      prisma.org.findFirst = vi.fn().mockResolvedValue({ id: 'org-1' })
      prisma.user.create = vi.fn().mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        orgId: 'org-1',
        email: 'test@example.com',
        name: 'Test',
        role: 'SALES',
      })
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as never)

      const result = await service.register({
        email: 'test@example.com',
        password: 'password',
        name: 'Test',
      })

      expect(result.token).toBe('jwt-token')
      expect(result.user.email).toBe('test@example.com')
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          orgId: 'org-1',
          email: 'test@example.com',
          name: 'Test',
          role: 'SALES',
        }),
      })
    })

    it('throws when email already exists', async () => {
      const prisma = createMockPrisma()
      const service = new AuthService(prisma, createMockJwt())

      prisma.user.findFirst = vi.fn().mockResolvedValue({ id: 'existing' })

      await expect(
        service.register({ email: 'test@example.com', password: 'pw', name: 'Test' }),
      ).rejects.toThrow('邮箱已被注册')
    })
  })

  describe('login', () => {
    it('returns token for valid credentials', async () => {
      const prisma = createMockPrisma()
      const jwt = createMockJwt()
      const service = new AuthService(prisma, jwt)

      prisma.user.findFirst = vi.fn().mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        orgId: 'org-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
        role: 'SALES',
        status: 'active',
      })
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

      const result = await service.login({ email: 'test@example.com', password: 'pw' })

      expect(result.token).toBe('jwt-token')
      expect(result.user.email).toBe('test@example.com')
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastLoginAt: expect.any(Date) },
      })
    })

    it('throws for non-existent user', async () => {
      const prisma = createMockPrisma()
      const service = new AuthService(prisma, createMockJwt())
      prisma.user.findFirst = vi.fn().mockResolvedValue(null)

      await expect(service.login({ email: 'x@x.com', password: 'pw' })).rejects.toThrow('邮箱或密码错误')
    })

    it('throws for invalid password', async () => {
      const prisma = createMockPrisma()
      const service = new AuthService(prisma, createMockJwt())
      prisma.user.findFirst = vi.fn().mockResolvedValue({ id: 'u1', passwordHash: 'h', status: 'active' })
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never)

      await expect(service.login({ email: 'x@x.com', password: 'pw' })).rejects.toThrow('邮箱或密码错误')
    })

    it('throws for inactive user even with valid password', async () => {
      const prisma = createMockPrisma()
      const service = new AuthService(prisma, createMockJwt())
      prisma.user.findFirst = vi.fn().mockResolvedValue({ id: 'u1', passwordHash: 'h', status: 'inactive' })
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

      await expect(service.login({ email: 'x@x.com', password: 'pw' })).rejects.toThrow('账号已被停用')
    })
  })

  describe('me', () => {
    it('returns user profile', async () => {
      const prisma = createMockPrisma()
      const service = new AuthService(prisma, createMockJwt())
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        role: 'SALES',
      })

      const result = await service.me('user-1')
      expect(result.email).toBe('test@example.com')
    })

    it('throws when user not found', async () => {
      const prisma = createMockPrisma()
      const service = new AuthService(prisma, createMockJwt())
      prisma.user.findUnique = vi.fn().mockResolvedValue(null)

      await expect(service.me('missing')).rejects.toThrow('用户不存在')
    })
  })
})
