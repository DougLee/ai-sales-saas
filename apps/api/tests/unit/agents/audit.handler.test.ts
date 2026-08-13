import { describe, it, expect, vi, beforeEach } from 'vitest'
import { audit } from '../../../src/agents/audit.handler.js'

const mockGenerateText = vi.fn()
const mockSkillExecute = vi.fn()
const mockRunLimiter = vi.fn((userId: string, fn: () => Promise<unknown>) => fn())

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: (...args: unknown[]) => mockGenerateText(...args),
  }
})

vi.mock('../../../src/config/model-provider.js', () => ({
  createModel: () => ({ model: 'mock-model' }),
}))

vi.mock('../../../src/config/ai-config.js', () => ({
  getAIConfig: vi.fn(() => ({
    openaiApiKey: 'test-key',
    modelName: 'test-model',
    provider: 'test-provider',
  })),
}))

vi.mock('../../../src/infra/concurrency-limiter.js', () => ({
  llmConcurrencyLimiter: { run: (userId: string, fn: () => Promise<unknown>) => mockRunLimiter(userId, fn) },
}))

vi.mock('../../../src/agents/skills/index.js', () => ({
  skillRegistry: {
    execute: (...args: unknown[]) => mockSkillExecute(...args),
  },
}))

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'project_1',
        name: '测试项目',
        company: { name: '测试客户' },
        milestone: 1,
        healthScore: 70,
        ...overrides,
      }),
    },
    timelineEvent: {
      create: vi.fn().mockResolvedValue({ id: 'timeline_1' }),
    },
  }
}

function createMockReply() {
  const chunks: string[] = []
  return {
    type: vi.fn().mockReturnThis(),
    code: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    raw: {
      write: vi.fn((chunk: string) => chunks.push(chunk)),
      end: vi.fn(),
    },
    sent: false,
    _chunks: chunks,
  }
}

function createMockRequest(body: Record<string, unknown>, prisma: unknown) {
  return {
    body,
    user: { id: 'user_1', tenantId: 'tenant_1', role: 'SALES', orgId: 'org_1' },
    tenantPrisma: prisma,
    id: 'req_1',
  } as any
}

describe('audit.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateText.mockReset()
    mockSkillExecute.mockReset()
  })

  it('executes structuredLedger skill and streams response', async () => {
    const prisma = createMockPrisma()
    const req = createMockRequest(
      {
        transcript: '客户确认预算50万',
        projectId: 'project_1',
        customerId: 'customer_1',
      },
      prisma,
    )
    const reply = createMockReply()

    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        summary: '客户确认预算',
        toolCalls: [
          {
            name: 'projectStructuredLedger',
            arguments: {
              projectId: 'project_1',
              summary: '客户确认预算50万',
              evidenceSegment: '客户确认预算50万',
            },
          },
        ],
        nextActions: ['推进到方案阶段'],
      }),
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    })

    mockSkillExecute.mockResolvedValue({
      success: true,
      data: { timelineEventId: 'timeline_1' },
    })

    await audit(req, reply as any)

    expect(mockSkillExecute).toHaveBeenCalledTimes(1)
    expect(mockSkillExecute).toHaveBeenCalledWith(
      'project-analysis',
      expect.objectContaining({ action: 'structuredLedger', projectId: 'project_1' }),
      expect.objectContaining({ userId: 'user_1', tenantId: 'tenant_1' }),
    )
    expect(reply.raw.end).toHaveBeenCalled()
    expect(reply._chunks.join('')).toContain('审计摘要')
    expect(reply._chunks.join('')).toContain('projectStructuredLedger')
  })

  it('falls back to raw text when LLM output is not valid JSON', async () => {
    const prisma = createMockPrisma()
    const req = createMockRequest({ transcript: '一些非结构化文本', projectId: 'project_1' }, prisma)
    const reply = createMockReply()

    mockGenerateText.mockResolvedValue({
      text: '这不是 JSON',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    })

    await audit(req, reply as any)

    expect(reply.raw.end).toHaveBeenCalled()
    const output = reply._chunks.join('')
    expect(output).toContain('这不是 JSON')
    expect(mockSkillExecute).not.toHaveBeenCalled()
  })

  it('continues when skill execution fails', async () => {
    const prisma = createMockPrisma()
    const req = createMockRequest({ transcript: '客户确认预算', projectId: 'project_1' }, prisma)
    const reply = createMockReply()

    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        summary: '客户确认预算',
        toolCalls: [
          {
            name: 'projectStructuredLedger',
            arguments: { projectId: 'project_1', summary: '客户确认预算', evidenceSegment: '原文' },
          },
        ],
        nextActions: [],
      }),
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    })

    mockSkillExecute.mockResolvedValue({
      success: false,
      error: { code: 'EXECUTION_ERROR', message: 'skill failed' },
    })

    await audit(req, reply as any)

    expect(mockSkillExecute).toHaveBeenCalledTimes(1)
    expect(reply.raw.end).toHaveBeenCalled()
    const output = reply._chunks.join('')
    expect(output).toContain('❌ 失败')
  })

  it('throws 503 when AI config is missing', async () => {
    const { getAIConfig } = await import('../../../src/config/ai-config.js')
    vi.mocked(getAIConfig).mockReturnValueOnce({ openaiApiKey: '', modelName: '', provider: '' } as any)

    const prisma = createMockPrisma()
    const req = createMockRequest({ transcript: 'test' }, prisma)
    const reply = createMockReply()

    await expect(audit(req, reply as any)).rejects.toMatchObject({
      statusCode: 503,
      message: 'AI 模型未配置',
    })
  })
})
