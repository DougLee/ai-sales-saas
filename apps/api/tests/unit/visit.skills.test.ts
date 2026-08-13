import { describe, it, expect, vi, beforeEach } from 'vitest'
import { visitQuerySkill } from '../../src/agents/skills/visit/visit-query.skill.js'
import { visitAnalysisSkill } from '../../src/agents/skills/visit/visit-analysis.skill.js'

const mockGenerateText = vi.fn()
const mockCreateModel = vi.fn().mockReturnValue({ model: 'mock-model' })
const mockRunLimiter = vi.fn((userId: string, fn: () => Promise<unknown>) => fn())

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: (...args: unknown[]) => mockGenerateText(...args),
  }
})

vi.mock('../../src/config/model-provider.js', () => ({
  createModel: () => mockCreateModel(),
}))

vi.mock('../../src/infra/concurrency-limiter.js', () => ({
  llmConcurrencyLimiter: { run: (userId: string, fn: () => Promise<unknown>) => mockRunLimiter(userId, fn) },
}))

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    visit: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  }
}

function createContext(prisma: unknown) {
  return {
    tenantId: 'tenant_1',
    userId: 'user_1',
    orgId: 'org_1',
    role: 'SALES',
    prisma,
    traceId: 'trace_1',
    sessionId: 'session_1',
  }
}

describe('visit-query skill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('search returns visits filtered by projectId', async () => {
    const visits = [
      { id: 'v1', summary: '初次拜访', project: { name: '项目A' } },
      { id: 'v2', summary: '跟进拜访', project: { name: '项目A' } },
    ]
    const prisma = createMockPrisma({
      visit: {
        findMany: vi.fn().mockResolvedValue(visits),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    })

    const result = await visitQuerySkill.execute({
      params: { action: 'search', projectId: 'project_1' },
      context: createContext(prisma),
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ action: 'search', count: 2, visits })
    expect(prisma.visit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: 'project_1' }),
        take: 10,
        orderBy: { visitTime: 'desc' },
      }),
    )
  })

  it('search filters by keyword on summary and audioTranscript', async () => {
    const prisma = createMockPrisma()

    await visitQuerySkill.execute({
      params: { action: 'search', keyword: '预算' },
      context: createContext(prisma),
    })

    expect(prisma.visit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { summary: { contains: '预算', mode: 'insensitive' } },
            { audioTranscript: { contains: '预算', mode: 'insensitive' } },
          ],
        },
      }),
    )
  })

  it('detail returns visit with project context', async () => {
    const visit = {
      id: 'v1',
      summary: '拜访记录',
      project: {
        id: 'project_1',
        name: '项目A',
        milestone: 2,
        company: { name: '客户A' },
        contacts: [{ role: '决策人', contact: { name: '张三', position: '处长' } }],
        visits: [{ id: 'v0', summary: '上次拜访' }],
      },
    }
    const prisma = createMockPrisma({
      visit: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(visit),
        update: vi.fn().mockResolvedValue({}),
      },
    })

    const result = await visitQuerySkill.execute({
      params: { action: 'detail', visitId: 'v1' },
      context: createContext(prisma),
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ action: 'detail', visit })
    expect(prisma.visit.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'v1' } }),
    )
  })
})

describe('visit-analysis skill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ milestoneProgress: 'M2→M3', nextActions: ['确认预算'] }),
      usage: { totalTokens: 100 },
    })
  })

  it('returns NOT_FOUND when visit does not exist', async () => {
    const prisma = createMockPrisma()

    const result = await visitAnalysisSkill.execute({
      params: { visitId: 'missing' },
      context: createContext(prisma),
    })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('NOT_FOUND')
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it('returns EMPTY_CONTENT when visit has no analyzable content', async () => {
    const prisma = createMockPrisma({
      visit: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({
          id: 'v1',
          summary: '',
          audioTranscript: '',
          project: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    })

    const result = await visitAnalysisSkill.execute({
      params: { visitId: 'v1' },
      context: createContext(prisma),
    })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('EMPTY_CONTENT')
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it('analyzes visit and persists aiAnalysis', async () => {
    const analysis = { milestoneProgress: 'M2→M3', nextActions: ['确认预算'] }
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify(analysis),
      usage: { totalTokens: 100 },
    })

    const prisma = createMockPrisma({
      visit: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({
          id: 'v1',
          summary: '客户反馈预算50万',
          audioTranscript: '',
          project: {
            id: 'project_1',
            name: '项目A',
            milestone: 2,
            company: { name: '客户A' },
            contacts: [],
            visits: [],
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    })

    const result = await visitAnalysisSkill.execute({
      params: { visitId: 'v1' },
      context: createContext(prisma),
    })

    expect(result.success).toBe(true)
    expect(result.data?.analysis).toEqual(analysis)
    expect(mockRunLimiter).toHaveBeenCalledTimes(1)
    expect(mockRunLimiter).toHaveBeenCalledWith('user_1', expect.any(Function))
    expect(prisma.visit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1' },
        data: { aiAnalysis: analysis },
      }),
    )
  })

  it('falls back to raw text slice when LLM output is not valid JSON', async () => {
    mockGenerateText.mockResolvedValue({
      text: '这不是 JSON',
      usage: { totalTokens: 50 },
    })

    const prisma = createMockPrisma({
      visit: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({
          id: 'v1',
          summary: '客户反馈预算50万',
          audioTranscript: '',
          project: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    })

    const result = await visitAnalysisSkill.execute({
      params: { visitId: 'v1' },
      context: createContext(prisma),
    })

    expect(result.success).toBe(true)
    expect(result.data?.analysis).toMatchObject({ milestoneProgress: '这不是 JSON' })
  })
})
