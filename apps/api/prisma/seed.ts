import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { ensureDefaultConfigs } from '../src/methodology/methodology-seed'

const SALT_ROUNDS = 10

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 开始初始化种子数据...')

  // 1. 默认租户
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default-demo' },
    update: {},
    create: {
      name: '默认企业',
      slug: 'default-demo',
      plan: 'professional',
      maxUsers: 20,
    },
  })
  console.log(`✅ 租户: ${tenant.name} (${tenant.id})`)

  // 1.5 默认销售方法论配置
  await ensureDefaultConfigs(prisma, tenant.id)
  console.log('✅ 方法论配置已初始化')

  // 2. 默认组织/部门
  let org = await prisma.org.findFirst({
    where: { tenantId: tenant.id, name: '销售一部' },
  })
  if (!org) {
    org = await prisma.org.create({
      data: {
        tenantId: tenant.id,
        name: '销售一部',
      },
    })
    console.log(`✅ 部门: ${org.name} (${org.id})`)
  } else {
    console.log(`⏭️  部门已存在: ${org.name}`)
  }

  // 3. 示例用户
  const users = [
    { email: 'admin@example.com', name: '系统管理员', role: 'SUPER_ADMIN' as const },
    { email: 'manager@example.com', name: '销售总监', role: 'TENANT_ADMIN' as const },
    { email: 'head@example.com', name: '部门主管', role: 'DEPT_HEAD' as const },
    { email: 'sales@example.com', name: '销售小王', role: 'SALES' as const },
    { email: 'viewer@example.com', name: '观察员', role: 'VIEWER' as const },
  ]

  for (const u of users) {
    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
    })
    if (existing) {
      console.log(`⏭️  用户已存在: ${u.email}`)
      continue
    }
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        orgId: org.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: 'active',
        passwordHash: await bcrypt.hash('admin123', SALT_ROUNDS),
      },
    })
    console.log(`✅ 用户: ${u.name} <${u.email}> / 密码: admin123 / 角色: ${u.role}`)
  }

  // 4. 示例客户（公司）
  let company = await prisma.company.findFirst({
    where: { tenantId: tenant.id, name: '河南科技学院' },
  })
  if (!company) {
    company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: '河南科技学院',
        industry: 'education',
        region: '新乡',
        level: '省属重点',
        status: 'following',
        ownerId: (await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: 'sales@example.com' } } }))?.id,
      },
    })
    console.log(`✅ 客户: ${company.name} (${company.id})`)
  } else {
    console.log(`⏭️  客户已存在: ${company.name}`)
  }

  // 4.1 目标客户池示例
  let targetCompany = await prisma.company.findFirst({
    where: { tenantId: tenant.id, name: '洛阳理工学院' },
  })
  if (!targetCompany) {
    targetCompany = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: '洛阳理工学院',
        industry: 'education',
        region: '洛阳',
        level: '普通本科',
        status: 'target',
        dataConfidence: 'medium',
        source: 'ai_recommendation',
      },
    })
    console.log(`✅ 目标客户: ${targetCompany.name} (${targetCompany.id})`)
  } else {
    console.log(`⏭️  目标客户已存在: ${targetCompany.name}`)
  }

  // 5. 示例商机
  const salesUser = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: 'sales@example.com' } } })
  let project = await prisma.project.findFirst({
    where: { tenantId: tenant.id, name: '人工智能通识课项目' },
  })
  if (!project) {
    project = await prisma.project.create({
      data: {
        tenantId: tenant.id,
        orgId: org.id,
        ownerId: salesUser!.id,
        companyId: company.id,
        name: '人工智能通识课项目',
        industry: 'education',
        milestone: 2,
        healthScore: 65,
        urgency: 'MEDIUM',
      },
    })
    console.log(`✅ 商机: ${project.name} (${project.id})`)
  } else {
    console.log(`⏭️  商机已存在: ${project.name}`)
  }

  // 6. 示例线索（关联目标客户）
  let lead = await prisma.lead.findFirst({
    where: { tenantId: tenant.id, name: '洛阳理工学院-智慧教室线索' },
  })
  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        orgId: org.id,
        ownerId: salesUser!.id,
        companyId: targetCompany.id,
        name: '洛阳理工学院-智慧教室线索',
        industry: 'education',
        status: 'FOLLOWING',
        source: 'territory_search',
        contactName: '李主任',
        contactPhone: '13800138000',
        completenessScore: 45,
      },
    })
    console.log(`✅ 线索: ${lead.name} (${lead.id})`)
  } else {
    console.log(`⏭️  线索已存在: ${lead.name}`)
  }

  // 7. 示例任务
  const task = await prisma.task.upsert({
    where: {
      id: 'seed-task-1',
    },
    update: {},
    create: {
      id: 'seed-task-1',
      tenantId: tenant.id,
      orgId: org.id,
      companyId: company.id,
      ownerId: salesUser!.id,
      projectId: project.id,
      title: '确认河南科技学院预算审批人',
      description: '下次拜访时请确认财务处长是否参与审批',
      priority: 'HIGH',
      status: 'PENDING',
      source: 'agent_nba',
    },
  })
  console.log(`✅ 任务: ${task.title} (${task.id})`)

  // 7.5 V6.1 项目类型配置（停滞阈值分档 + 阶段推进规则，Tom 2026-08-08 确认）
  const DEFAULT_ADVANCEMENT_RULES: Record<string, Record<string, unknown>> = {
    '0': { minVisits: 1, minContacts: 1, requiresClosure: false },
    '1': { minVisits: 1, minPainPoints: 3, requiresClosure: true },
    '2': { minVisits: 2, minDecisionMaker: 1, requiresClosure: true },
    '3': { minVisits: 2, hasBudgetInfo: true, requiresClosure: true },
    '4': { minVisits: 3, hasProposalDoc: true, requiresClosure: true },
    '5': { minVisits: 2, hasQuoteDoc: true, requiresClosure: true },
    '6': { minVisits: 2, hasContractDraft: true, requiresClosure: true },
    '7': { minVisits: 1, hasBidResult: true, requiresClosure: false },
  }
  const DEFAULT_STAGE_THRESHOLDS = [0, 10, 21, 30, 45, 45, 45, 45, 45]

  const projectTypeConfigs = [
    { typeKey: 'integration_large', typeName: '千万级集成项目', attentionDays: 30, staleDays: 60 },
    { typeKey: 'software_mid', typeName: '百万级软件项目', attentionDays: 21, staleDays: 45 },
    { typeKey: 'procurement_small', typeName: '小额采购/续费', attentionDays: 14, staleDays: 28 },
    { typeKey: 'default', typeName: '其他/未分类', attentionDays: 14, staleDays: 28 },
  ]
  for (const cfg of projectTypeConfigs) {
    await prisma.projectTypeConfig.upsert({
      where: { tenantId_typeKey: { tenantId: tenant.id, typeKey: cfg.typeKey } },
      update: {},
      create: {
        tenantId: tenant.id,
        typeKey: cfg.typeKey,
        typeName: cfg.typeName,
        attentionDays: cfg.attentionDays,
        staleDays: cfg.staleDays,
        stageThresholds: DEFAULT_STAGE_THRESHOLDS as never,
        advancementRules: DEFAULT_ADVANCEMENT_RULES as never,
        effectiveFollowupMinScore: 40,
      },
    })
  }
  console.log('✅ 项目类型配置已初始化（4 档）')

  console.log('\n🎉 种子数据初始化完成')
  console.log('默认登录账号:')
  console.log('  管理员: admin@example.com / admin123')
  console.log('  销售:   sales@example.com / admin123')
  console.log('  主管:   head@example.com / admin123')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
