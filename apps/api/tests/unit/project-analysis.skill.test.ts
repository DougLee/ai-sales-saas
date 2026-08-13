import { describe, it, expect, vi, beforeEach } from 'vitest'
import { projectAnalysisSkill } from '../../src/agents/skills/analysis/project-analysis.skill.js'

vi.mock('../../src/milestone-gate/index.js', () => ({
  loadMilestoneGates: vi.fn().mockResolvedValue([]),
  validateMilestoneAdvance: vi.fn().mockResolvedValue({ passed: true, missing: [] }),
}))

function createMockPrisma(projectOverrides: Record<string, unknown> = {}) {
  const projectData = {
    companyId: 'company_1',
    ownerId: 'owner_1',
    milestone: 0,
    owner: { orgId: 'org_1' },
    humanInfo: { firstContact: '电话' },
    businessInfo: {},
    financeInfo: {},
    decisionMap: {},
    evidence: [],
    milestoneHistory: [],
    evidenceChain: [],
    ...projectOverrides,
  }

  return {
    timelineEvent: {
      create: vi.fn().mockResolvedValue({ id: 'timeline_1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue(projectData),
      findFirst: vi.fn().mockResolvedValue(projectData),
      update: vi.fn().mockResolvedValue({}),
    },
    task: {
      create: vi.fn().mockResolvedValue({ id: 'task_1' }),
    },
    methodologyConfig: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  }
}

describe('project-analysis skill', () => {
  let context: any

  beforeEach(() => {
    context = {
      tenantId: 'tenant_1',
      userId: 'user_1',
      orgId: 'org_1',
      role: 'SALES',
      prisma: createMockPrisma(),
    }
    vi.clearAllMocks()
  })

  it('structuredLedger should create TimelineEvent and update Project', async () => {
    const result = await projectAnalysisSkill.execute({
      params: {
        action: 'structuredLedger',
        projectId: 'project_1',
        summary: '客户确认预算50万',
        cognitivePayload: { perceivedIntent: '积极推进', confidence: 0.9 },
        mutations: { milestone: 1, healthScore: 80 },
        evidenceSegment: '客户说："预算大概50万左右，年底批复"',
      },
      context,
    })

    expect(result.success).toBe(true)
    expect(result.data?.gateBlocked).toBeUndefined()
    expect(context.prisma.timelineEvent.create).toHaveBeenCalledTimes(1)
    expect(context.prisma.project.update).toHaveBeenCalledTimes(1)

    const projectUpdateCall = context.prisma.project.update.mock.calls[0][0]
    expect(projectUpdateCall.data.milestone).toBe(1)
    expect(projectUpdateCall.data.healthScore).toBe(80)
    expect(projectUpdateCall.data.evidenceChain).toHaveLength(1)
    expect(projectUpdateCall.data.evidenceChain[0].timelineEventId).toBe('timeline_1')
  })

  it('structuredLedger should block milestone advance when gate fails', async () => {
    const { validateMilestoneAdvance } = await import('../../src/milestone-gate/index.js')
    vi.mocked(validateMilestoneAdvance).mockResolvedValueOnce({
      passed: false,
      missing: [{ path: 'humanInfo.firstContact', label: '首次接触方式' }],
    } as any)

    context.prisma = createMockPrisma({
      milestone: 0,
      humanInfo: {}, // 缺少 firstContact
    })

    const result = await projectAnalysisSkill.execute({
      params: {
        action: 'structuredLedger',
        projectId: 'project_1',
        summary: '客户愿意继续沟通',
        cognitivePayload: { perceivedIntent: '中立', confidence: 0.6 },
        mutations: { milestone: 1 },
        evidenceSegment: '客户说："后续再联系"',
      },
      context,
    })

    expect(result.success).toBe(false)
    expect(result.data?.gateBlocked).toBe(true)
    expect(result.data?.missingFields).toEqual([{ path: 'humanInfo.firstContact', label: '首次接触方式' }])
    expect(result.error?.message).toContain('首次接触方式')

    // 应该创建 gate 阻断 TimelineEvent 和 NBA 任务
    expect(context.prisma.timelineEvent.create).toHaveBeenCalledTimes(1)
    expect(context.prisma.task.create).toHaveBeenCalledTimes(1)

    const timelineCall = context.prisma.timelineEvent.create.mock.calls[0][0]
    expect(timelineCall.data.eventSubtype).toBe('milestone.gate_blocked')

    const taskCall = context.prisma.task.create.mock.calls[0][0]
    expect(taskCall.data.title).toContain('补齐里程碑推进条件')
    expect(taskCall.data.source).toBe('agent_gate_blocked')

    // 不应该更新 project
    expect(context.prisma.project.update).not.toHaveBeenCalled()
  })

  it('structuredLedger should skip gate check when milestone decreases', async () => {
    context.prisma = createMockPrisma({
      milestone: 2,
      humanInfo: {},
      businessInfo: {},
    })

    const result = await projectAnalysisSkill.execute({
      params: {
        action: 'structuredLedger',
        projectId: 'project_1',
        summary: '重新评估为早期阶段',
        mutations: { milestone: 1 },
        evidenceSegment: '客户反馈需求尚不明确',
      },
      context,
    })

    expect(result.success).toBe(true)
    expect(result.data?.gateBlocked).toBeUndefined()
    expect(context.prisma.project.update).toHaveBeenCalledTimes(1)
  })

  it('structuredLedger should skip gate check when milestone unchanged', async () => {
    context.prisma = createMockPrisma({
      milestone: 0,
      humanInfo: {},
    })

    const result = await projectAnalysisSkill.execute({
      params: {
        action: 'structuredLedger',
        projectId: 'project_1',
        summary: '补充客户背景',
        mutations: { healthScore: 70 },
        evidenceSegment: '客户行业为教育',
      },
      context,
    })

    expect(result.success).toBe(true)
    expect(result.data?.gateBlocked).toBeUndefined()
    expect(context.prisma.project.update).toHaveBeenCalledTimes(1)
    expect(context.prisma.project.update.mock.calls[0][0].data.healthScore).toBe(70)
  })

  it('raiseRiskAndPlanNBA should create TimelineEvent and Task', async () => {
    const result = await projectAnalysisSkill.execute({
      params: {
        action: 'raiseRiskAndPlanNBA',
        projectId: 'project_1',
        missingDimension: 'FINANCE',
        diagnosticRisk: '未确认预算审批人，可能导致项目卡住',
        nextBestActionPrompt: '下次拜访时请确认财务处长是否参与审批',
      },
      context,
    })

    expect(result.success).toBe(true)
    expect(result.data?.taskId).toBe('task_1')
    expect(context.prisma.timelineEvent.create).toHaveBeenCalledTimes(1)
    expect(context.prisma.task.create).toHaveBeenCalledTimes(1)

    const taskCall = context.prisma.task.create.mock.calls[0][0]
    expect(taskCall.data.title).toContain('财')
    expect(taskCall.data.priority).toBe('HIGH')
    expect(taskCall.data.source).toBe('agent_nba')
  })
})
