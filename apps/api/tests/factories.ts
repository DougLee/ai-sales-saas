import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

export async function createTenant(overrides?: Partial<Prisma.TenantCreateInput>) {
  return prisma.tenant.create({
    data: {
      name: 'Test Tenant',
      slug: `test-tenant-${Date.now()}`,
      ...overrides,
    },
  })
}

export async function createOrg(tenantId: string, overrides?: Partial<Prisma.OrgCreateInput>) {
  return prisma.org.create({
    data: {
      tenantId,
      name: 'Test Org',
      ...overrides,
    },
  })
}

export async function createUser(overrides?: Partial<Prisma.UserCreateInput> & { tenantId?: string }) {
  const tenantId = overrides?.tenantId || 'default'
  let orgId = overrides?.orgId as string | undefined
  if (!orgId) {
    const org = await createOrg(tenantId)
    orgId = org.id
  }

  // 剥离 caller 传进来的 undefined 字段（包括 orgId 未明确传的场景），
  // 由下方显式赋值，避免 Prisma 6 拒收「orgId: undefined」
  const cleanedOverrides: Record<string, unknown> = {}
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) cleanedOverrides[k] = v
    }
  }

  return prisma.user.create({
    data: {
      email: `user-${Date.now()}@test.com`,
      name: 'Test User',
      role: 'SALES',
      tenantId,
      orgId,
      passwordHash: 'hash',
      ...cleanedOverrides,
    },
  })
}

export async function createProject(
  overrides?: Partial<Prisma.ProjectCreateInput> & { tenantId?: string; ownerId?: string; orgId?: string }
) {
  const tenantId = overrides?.tenantId || 'default'
  let ownerId = overrides?.ownerId
  let orgId = overrides?.orgId

  if (!ownerId) {
    const user = await createUser({ tenantId, orgId: orgId || undefined })
    ownerId = user.id
    orgId = user.orgId
  }

  // 剥离 caller 传进来的 undefined 字段
  const cleanedOverrides: Record<string, unknown> = {}
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) cleanedOverrides[k] = v
    }
  }

  return prisma.project.create({
    data: {
      name: `Project ${Date.now()}`,
      milestone: 0,
      tenantId,
      ownerId,
      orgId: orgId ?? null,
      ...cleanedOverrides,
    },
  })
}

export async function createLead(
  overrides?: Partial<Prisma.LeadCreateInput> & { tenantId?: string; ownerId?: string; orgId?: string; companyId?: string }
) {
  const tenantId = overrides?.tenantId || 'default'
  let ownerId = overrides?.ownerId
  let orgId = overrides?.orgId
  let companyId = overrides?.companyId

  if (!ownerId) {
    const user = await createUser({ tenantId, orgId: orgId || undefined })
    ownerId = user.id
    orgId = user.orgId
  }
  if (!companyId) {
    const company = await prisma.company.create({
      data: { tenantId, name: `Lead Co ${Date.now()}` },
    })
    companyId = company.id
  }

  // 剥离 caller 传进来的 undefined 字段，避免 Prisma 6 拒收「required 字段 undefined」
  const cleanedOverrides: Record<string, unknown> = {}
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) cleanedOverrides[k] = v
    }
  }

  return prisma.lead.create({
    data: {
      name: `Lead ${Date.now()}`,
      status: 'FOLLOWING',
      tenantId,
      ownerId,
      orgId: orgId ?? null,
      companyId,
      ...cleanedOverrides,
    },
  })
}

export async function createTask(
  overrides?: Partial<Prisma.TaskCreateInput> & { tenantId?: string; ownerId?: string; orgId?: string; projectId?: string }
) {
  const tenantId = overrides?.tenantId || 'default'
  let ownerId = overrides?.ownerId
  let orgId = overrides?.orgId

  if (!ownerId) {
    const user = await createUser({ tenantId, orgId: orgId || undefined })
    ownerId = user.id
    orgId = user.orgId
  }

  // 剥离 caller 传进来的 undefined 字段
  const cleanedOverrides: Record<string, unknown> = {}
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) cleanedOverrides[k] = v
    }
  }

  return prisma.task.create({
    data: {
      title: `Task ${Date.now()}`,
      status: 'PENDING',
      priority: 'MEDIUM',
      tenantId,
      ownerId,
      orgId: orgId ?? null,
      projectId: overrides?.projectId ?? null,
      ...cleanedOverrides,
    },
  })
}

export async function cleanupTestData(tenantId: string) {
  // 按外键反向顺序清理；V6.1 新表（含 customerSnapshot / aiPendingItem / projectTypeConfig / timelineEvent 等）一并清掉
  await prisma.behaviorLog.deleteMany({ where: { tenantId } })
  await prisma.aiPendingItem.deleteMany({ where: { tenantId } })
  await prisma.customerSnapshot.deleteMany({ where: { tenantId } })
  await prisma.timelineEvent.deleteMany({ where: { tenantId } })
  await prisma.task.deleteMany({ where: { tenantId } })
  await prisma.leadFollowUp.deleteMany({ where: { tenantId } })
  await prisma.lead.deleteMany({ where: { tenantId } })
  await prisma.visitClosure.deleteMany({ where: { visit: { tenantId } } })
  await prisma.visit.deleteMany({ where: { tenantId } })
  await prisma.project.deleteMany({ where: { tenantId } })
  await prisma.company.deleteMany({ where: { tenantId } })
  await prisma.projectTypeConfig.deleteMany({ where: { tenantId } })
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.org.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
}
