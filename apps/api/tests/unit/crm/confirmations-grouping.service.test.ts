import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'

// finalizeVisitConfirmation 会触发闭环刷新（读 visits/prep 等一串表）——单测只关心落库分发，mock 掉
vi.mock('../../../src/crm/visits/closure.service.js', () => ({
  refreshClosure: vi.fn().mockResolvedValue({}),
}))

const {
  applyConfirmedItem,
  resolveItem,
  createAutoAppliedItem,
  normalizeGroupItems,
  normalizePackageActions,
  AUTO_APPLY_TYPES,
} = await import('../../../src/crm/confirmations/confirmations.service.js')

/**
 * #42 归类确认：提取产物从"条目原子化"改为"归类确认 + 任务包"
 * - task_package 确认 → 1 个主线任务（编号步骤清单，MEDIUM，继承 deadline 无则 +7 天）
 * - pain_points_group / competitors_group → 数组批量追加，按批撤销可挑单条保留
 * - 旧单条 payload（无 items/actions 包装）读时包装为单元素数组，行为不变
 */

interface ProjectShape {
  id: string
  tenantId: string
  orgId: string | null
  companyId: string
  humanInfo: unknown
  businessInfo: unknown
  financeInfo: unknown
  evidence: unknown
  decisionMap: unknown
}

function makeProject(overrides: Partial<ProjectShape> = {}): ProjectShape {
  return {
    id: 'p1',
    tenantId: 't1',
    orgId: 'org1',
    companyId: 'c1',
    humanInfo: { painPoints: [] },
    businessInfo: { competitors: [] },
    financeInfo: {},
    evidence: {},
    decisionMap: {},
    ...overrides,
  }
}

function makePrisma(project?: ProjectShape) {
  const state = {
    project: project ? { ...project } : undefined,
    projectUpdates: [] as Array<Record<string, unknown>>,
    tasks: [] as Array<Record<string, unknown>>,
    pendingUpdates: [] as Array<Record<string, unknown>>,
  }
  const prisma = {
    project: {
      findFirst: vi.fn(async () => (state.project ? { ...state.project } : null)),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.projectUpdates.push(data)
        Object.assign(state.project!, data)
        return state.project
      }),
    },
    task: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.tasks.push(data)
        return { id: `task-${state.tasks.length}`, ...data }
      }),
    },
    company: { findFirst: vi.fn(async () => ({ id: 'c1' })) },
    timelineEvent: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data) },
    visit: { findUnique: vi.fn(async () => ({ companyId: 'c1' })) },
    aiPendingItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 1), // 默认"还有剩余 pending"，跳过 finalize 分支
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.pendingUpdates.push(data)
        return { id: 'item1', ...data }
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'item-new', ...data })),
    },
  }
  return { prisma: prisma as unknown as PrismaClient, state }
}

function pkgItem(itemData: Record<string, unknown>, itemType = 'task_package') {
  return {
    id: 'item1',
    tenantId: 't1',
    ownerId: 'u1',
    projectId: 'p1',
    visitId: 'v1',
    itemType,
    itemData,
    status: 'pending',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('normalizeGroupItems / normalizePackageActions（读侧兼容包装）', () => {
  it('items 数组去空、trim；旧单条 content/title 包装为单元素数组', () => {
    expect(normalizeGroupItems({ items: [' 痛点A ', '', '痛点B'] })).toEqual(['痛点A', '痛点B'])
    expect(normalizeGroupItems({ content: '旧单条诉求' })).toEqual(['旧单条诉求'])
    expect(normalizeGroupItems({ title: '旧单条动作' })).toEqual(['旧单条动作'])
    expect(normalizeGroupItems({})).toEqual([])
  })

  it('actions 解包：去空 title；旧单条 title/content 包装为单元素数组', () => {
    expect(normalizePackageActions({ actions: [{ title: ' 提交方案 ' }, { title: '' }, { title: '约访', deadline: '2026-08-20T00:00:00.000Z' }] })).toEqual([
      { title: '提交方案', deadline: undefined },
      { title: '约访', deadline: '2026-08-20T00:00:00.000Z' },
    ])
    expect(normalizePackageActions({ title: '旧单条任务' })).toEqual([{ title: '旧单条任务', deadline: undefined }])
  })
})

describe('applyConfirmedItem · task_package（1 包 → 1 主线任务）', () => {
  it('确认生成 1 个主线任务：title=第一动作，description=编号步骤清单，priority=MEDIUM，deadline 继承', async () => {
    const { prisma, state } = makePrisma(makeProject())
    const itemData = {
      title: '提交方案初稿',
      content: '提交方案初稿；约王校长复盘',
      actions: [{ title: '提交方案初稿' }, { title: '约王校长复盘' }],
      deadline: '2026-08-20T00:00:00.000Z',
    }
    const result = await applyConfirmedItem(prisma, pkgItem(itemData), itemData, 'u9')

    expect(state.tasks).toHaveLength(1)
    const task = state.tasks[0]
    expect(task.title).toBe('提交方案初稿')
    expect(task.description).toBe('1. 提交方案初稿\n2. 约王校长复盘')
    expect(task.priority).toBe('MEDIUM')
    expect(task.source).toBe('ai_visit_extraction')
    expect(task.sourceId).toBe('v1')
    expect((task.deadline as Date).toISOString()).toBe('2026-08-20T00:00:00.000Z')
    expect(result).toEqual({ taskId: 'task-1' })
    // TASK_CREATED(confirmed) 审计事件仍写入
    expect(prisma.timelineEvent.create).toHaveBeenCalledTimes(1)
  })

  it('无 deadline 时兜底 +7 天（不再 +3 天、不再 HIGH）', async () => {
    const { prisma, state } = makePrisma(makeProject())
    const itemData = { title: '跟进入场事宜', actions: [{ title: '跟进入场事宜' }] }
    await applyConfirmedItem(prisma, pkgItem(itemData), itemData, 'u9')

    expect(state.tasks).toHaveLength(1)
    const deadline = state.tasks[0].deadline as Date
    const diffDays = (deadline.getTime() - Date.now()) / 86400000
    expect(diffDays).toBeGreaterThan(6.9)
    expect(diffDays).toBeLessThan(7.1)
  })

  it('包级与步骤级 deadline 取最早', async () => {
    const { prisma, state } = makePrisma(makeProject())
    const itemData = {
      title: '推进合同',
      actions: [{ title: '推进合同', deadline: '2026-09-01T00:00:00.000Z' }],
      deadline: '2026-08-25T00:00:00.000Z',
    }
    await applyConfirmedItem(prisma, pkgItem(itemData), itemData, 'u9')
    expect((state.tasks[0].deadline as Date).toISOString()).toBe('2026-08-25T00:00:00.000Z')
  })

  it('「单开」逃生门：standaloneActions 拆出独立任务，其余步骤进主线任务（合计 ≤2 个任务）', async () => {
    const { prisma, state } = makePrisma(makeProject())
    const itemData = {
      title: '提交方案初稿',
      actions: [{ title: '提交方案初稿' }, { title: '申请招标文件' }, { title: '约王校长复盘' }],
    }
    const modified = { ...itemData, actions: [{ title: '提交方案初稿' }, { title: '约王校长复盘' }], standaloneActions: [{ title: '申请招标文件' }] }
    await applyConfirmedItem(prisma, pkgItem(itemData), modified, 'u9')

    expect(state.tasks).toHaveLength(2)
    expect(state.tasks[0].title).toBe('提交方案初稿')
    expect(state.tasks[0].description).toBe('1. 提交方案初稿\n2. 约王校长复盘')
    expect(state.tasks[1].title).toBe('申请招标文件')
    expect(String(state.tasks[1].description)).toContain('独立')
  })

  it('旧单条形态（无 actions 包装）读时包装为单元素数组，行为不变', async () => {
    const { prisma, state } = makePrisma(makeProject())
    const itemData = { title: '提交方案初稿' } as Record<string, unknown>
    await applyConfirmedItem(prisma, pkgItem(itemData), itemData, 'u9')
    expect(state.tasks).toHaveLength(1)
    expect(state.tasks[0].title).toBe('提交方案初稿')
    expect(state.tasks[0].description).toBe('1. 提交方案初稿')
  })

  it('空包不生成任务', async () => {
    const { prisma, state } = makePrisma(makeProject())
    await applyConfirmedItem(prisma, pkgItem({ actions: [] }), { actions: [] }, 'u9')
    expect(state.tasks).toHaveLength(0)
  })
})

describe('applyConfirmedItem · 类级批追加（pain_points_group / competitors_group）', () => {
  it('诉求批：全部追加，档案已有的跳过', async () => {
    const { prisma, state } = makePrisma(makeProject({ humanInfo: { painPoints: ['已有痛点'] } }))
    const itemData = { content: '设备老旧；已有痛点；缺少预算', items: ['设备老旧', '已有痛点', '缺少预算'] }
    await applyConfirmedItem(prisma, pkgItem(itemData, 'pain_points_group'), itemData, 'u9')

    expect(state.projectUpdates).toHaveLength(1)
    expect((state.project!.humanInfo as Record<string, unknown>).painPoints).toEqual(['已有痛点', '设备老旧', '缺少预算'])
  })

  it('竞品批：全部追加，档案已有的跳过', async () => {
    const { prisma, state } = makePrisma(makeProject({ businessInfo: { competitors: ['希沃'] } }))
    const itemData = { content: '鸿合；希沃；海康威视', items: ['鸿合', '希沃', '海康威视'] }
    await applyConfirmedItem(prisma, pkgItem(itemData, 'competitors_group'), itemData, 'u9')

    expect((state.project!.businessInfo as Record<string, unknown>).competitors).toEqual(['希沃', '鸿合', '海康威视'])
  })

  it('旧单条 key_request 回归：仍单条追加，行为不变', async () => {
    const { prisma, state } = makePrisma(makeProject({ humanInfo: { painPoints: [] } }))
    await applyConfirmedItem(prisma, pkgItem({ content: '国产化适配' }, 'key_request'), { content: '国产化适配' }, 'u9')
    expect((state.project!.humanInfo as Record<string, unknown>).painPoints).toEqual(['国产化适配'])
  })
})

describe('createAutoAppliedItem（自动类批条目即时落库）', () => {
  it('pain_points_group 自动生效：status=auto 落审计 + 批量追加', async () => {
    const { prisma, state } = makePrisma(makeProject())
    await createAutoAppliedItem(prisma, {
      tenantId: 't1',
      ownerId: 'u1',
      projectId: 'p1',
      visitId: 'v1',
      itemType: 'pain_points_group',
      itemData: { content: '设备老旧；缺少预算', items: ['设备老旧', '缺少预算'] },
    })

    expect(prisma.aiPendingItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ itemType: 'pain_points_group', status: 'auto' }) }),
    )
    expect((state.project!.humanInfo as Record<string, unknown>).painPoints).toEqual(['设备老旧', '缺少预算'])
  })
})

describe('resolveItem · revoke（按批撤销，可挑单条保留）', () => {
  function autoGroupItem(itemType: 'pain_points_group' | 'competitors_group', items: string[]) {
    return { ...pkgItem({ items }, itemType), status: 'auto' }
  }

  it('默认按批撤销：整批从档案移除，非本批内容不受影响', async () => {
    const { prisma, state } = makePrisma(makeProject({ humanInfo: { painPoints: ['设备老旧', '缺少预算', '更早录入的痛点'] } }))
    prisma.aiPendingItem.findFirst.mockResolvedValue(autoGroupItem('pain_points_group', ['设备老旧', '缺少预算']))

    await resolveItem(prisma, { itemId: 'item1', action: 'revoke', userId: 'u1', tenantId: 't1' })

    expect((state.project!.humanInfo as Record<string, unknown>).painPoints).toEqual(['更早录入的痛点'])
    expect(state.pendingUpdates[0]).toMatchObject({ status: 'revoked' })
  })

  it('modifiedData.items = 保留清单：挑单条保留', async () => {
    const { prisma, state } = makePrisma(makeProject({ humanInfo: { painPoints: ['设备老旧', '缺少预算'] } }))
    prisma.aiPendingItem.findFirst.mockResolvedValue(autoGroupItem('pain_points_group', ['设备老旧', '缺少预算']))

    await resolveItem(prisma, {
      itemId: 'item1',
      action: 'revoke',
      modifiedData: { items: ['缺少预算'] },
      userId: 'u1',
      tenantId: 't1',
    })

    expect((state.project!.humanInfo as Record<string, unknown>).painPoints).toEqual(['缺少预算'])
  })

  it('竞品批撤销', async () => {
    const { prisma, state } = makePrisma(makeProject({ businessInfo: { competitors: ['鸿合', '海康威视'] } }))
    prisma.aiPendingItem.findFirst.mockResolvedValue(autoGroupItem('competitors_group', ['鸿合']))

    await resolveItem(prisma, { itemId: 'item1', action: 'revoke', userId: 'u1', tenantId: 't1' })

    expect((state.project!.businessInfo as Record<string, unknown>).competitors).toEqual(['海康威视'])
  })
})

describe('resolveItem · confirm（task_package 走任务包分发）', () => {
  it('确认任务包：生成 1 个任务 + 条目标记 confirmed', async () => {
    const { prisma, state } = makePrisma(makeProject())
    const itemData = { title: '提交方案初稿', actions: [{ title: '提交方案初稿' }, { title: '约王校长复盘' }], deadline: '2026-08-20T00:00:00.000Z' }
    prisma.aiPendingItem.findFirst.mockResolvedValue(pkgItem(itemData))

    await resolveItem(prisma, { itemId: 'item1', action: 'confirm', userId: 'u1', tenantId: 't1' })

    expect(state.tasks).toHaveLength(1)
    expect(state.tasks[0].description).toBe('1. 提交方案初稿\n2. 约王校长复盘')
    expect(state.pendingUpdates[0]).toMatchObject({ status: 'confirmed' })
  })
})

describe('AUTO_APPLY_TYPES（分级信任边界）', () => {
  it('类级批条目纳入自动类（可撤销），task_package 不在其中（人工把关）', () => {
    expect((AUTO_APPLY_TYPES as readonly string[]).includes('pain_points_group')).toBe(true)
    expect((AUTO_APPLY_TYPES as readonly string[]).includes('competitors_group')).toBe(true)
    expect((AUTO_APPLY_TYPES as readonly string[]).includes('task_package')).toBe(false)
  })
})
