import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { RegisterInput, LoginInput } from './auth.schema.js'
import { sessionService } from '../session/session.service.js'
import { ensureDefaultConfigs } from '../methodology/methodology-seed.js'

const SALT_ROUNDS = 10

export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private jwt: FastifyInstance['jwt']
  ) {}

  async register(data: RegisterInput) {
    const existing = await this.prisma.user.findFirst({
      where: { email: data.email },
    })
    if (existing) {
      throw new Error('邮箱已被注册')
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS)

    // 多租户模式：根据 tenantName 决定加入哪个租户
    // - 传了 tenantName 且是新名字 → 创建新租户，第一个人自动是 TENANT_ADMIN
    // - 传了 tenantName 且是已有名字 → 加入该租户，新人是 SALES
    // - 没传 tenantName → 加入「默认企业」租户
    let tenant: { id: string; name: string } | null = null
    if (data.tenantName && data.tenantName.trim()) {
      // 按名字查找（不区分大小写）
      tenant = await this.prisma.tenant.findFirst({
        where: { name: data.tenantName.trim() },
        select: { id: true, name: true },
      })
      if (!tenant) {
        // 创建新租户（slug 用 cuid 兼容）
        const slug = 'tenant-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
        tenant = await this.prisma.tenant.create({
          data: {
            name: data.tenantName.trim(),
            slug,
            plan: 'free',
            maxUsers: 20,
            maxStorageMb: 10240,
          },
          select: { id: true, name: true },
        })
      }
    } else {
      // 兼容老逻辑：没传 tenantName → 加入或创建「默认企业」
      tenant = await this.prisma.tenant.findFirst({
        where: { name: '默认企业' },
        select: { id: true, name: true },
      })
      if (!tenant) {
        const slug = 'default-' + Date.now().toString(36)
        tenant = await this.prisma.tenant.create({
          data: {
            name: '默认企业',
            slug,
          },
          select: { id: true, name: true },
        })
      }
    }

    let org = await this.prisma.org.findFirst({
      where: { tenantId: tenant.id },
    })
    if (!org) {
      org = await this.prisma.org.create({
        data: {
          tenantId: tenant.id,
          name: '默认部门',
        },
      })
    }

    // 确保当前租户拥有默认销售方法论配置（幂等）
    await ensureDefaultConfigs(this.prisma, tenant.id)

    // C 方案：租户内第一个用户自动是 TENANT_ADMIN，后续注册都是 SALES
    // 这样租户创建后第一个注册的人自动拥有管理权限（无需 seed 预置）
    const existingUserCount = await this.prisma.user.count({
      where: { tenantId: tenant.id },
    })
    const role: 'TENANT_ADMIN' | 'SALES' =
      existingUserCount === 0 ? 'TENANT_ADMIN' : 'SALES'

    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        orgId: org.id,
        email: data.email,
        name: data.name,
        passwordHash,
        role,
      },
    })

    const token = this.jwt.sign({
      id: user.id,
      tenantId: user.tenantId,
      orgId: user.orgId,
      role: user.role,
      email: user.email,
    })

    await sessionService.createSession(user.id, token)

    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  }

  async login(data: LoginInput) {
    const user = await this.prisma.user.findFirst({
      where: { email: data.email },
    })
    if (!user) {
      throw new Error('邮箱或密码错误')
    }
    if (user.status !== 'active') {
      throw new Error('账号已被停用，请联系管理员')
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash)
    if (!valid) {
      throw new Error('邮箱或密码错误')
    }

    const token = this.jwt.sign({
      id: user.id,
      tenantId: user.tenantId,
      orgId: user.orgId,
      role: user.role,
      email: user.email,
    })

    const { kicked } = await sessionService.createSession(user.id, token)

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role }, kicked }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        tenantId: true,
        orgId: true,
        lastLoginAt: true,
      },
    })
    if (!user) {
      throw new Error('用户不存在')
    }
    return user
  }
}
