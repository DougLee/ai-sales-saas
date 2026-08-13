import { describe, it, expect, vi, beforeEach } from 'vitest'
import { chat } from '../../../src/agents/chat.handler.js'

const mockStreamText = vi.fn()
const mockRouteIntent = vi.fn()
const mockResolveSkills = vi.fn()
const mockSkillExecute = vi.fn()
const mockBuildSystemPrompt = vi.fn()
const mockSemanticSearch = vi.fn()
const mockScanOutput = vi.fn()
const mockFindExpert = vi.fn()
const mockAppendMessage = vi.fn()

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: (...args: unknown[]) => mockStreamText(...args),
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
  llmConcurrencyLimiter: {
    run: (_userId: string, fn: () => Promise<unknown>) => fn(),
  },
}))

vi.mock('../../../src/infra/llm-trace.js', () => ({
  traceLLMCall: vi.fn(async (_meta: unknown, fn: () => Promise<{ result: unknown; usage?: Record<string, unknown> }>) => {
    const { result, usage } = await fn()
    return { result, trace: { latencyMs: 0, ...usage } }
  }),
}))

vi.mock('../../../src/infra/logger.js', () => ({
  getComponentLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('../../../src/agents/core/agent-memory.js', () => ({
  agentMemory: {
    appendMessage: (...args: unknown[]) => mockAppendMessage(...args),
  },
}))

vi.mock('../../../src/agents/core/agent-router.js', () => ({
  routeIntent: (...args: unknown[]) => mockRouteIntent(...args),
}))

vi.mock('../../../src/agents/core/agent-skill-router.js', () => ({
  resolveSkills: (...args: unknown[]) => mockResolveSkills(...args),
}))

vi.mock('../../../src/agents/core/prompt-builder.js', () => ({
  buildSystemPrompt: (...args: unknown[]) => mockBuildSystemPrompt(...args),
}))

vi.mock('../../../src/agents/core/guardrails.js', () => ({
  scanOutput: (...args: unknown[]) => mockScanOutput(...args),
}))

vi.mock('../../../src/agents/experts/registry.js', () => ({
  findExpert: (...args: unknown[]) => mockFindExpert(...args),
}))

vi.mock('../../../src/agents/skills/index.js', () => ({
  skillRegistry: {
    execute: (...args: unknown[]) => mockSkillExecute(...args),
    list: vi.fn(() => [{ id: 'project-query' }, { id: 'kb-search' }]),
  },
}))

vi.mock('../../../src/knowledge-base/kb-embedder.js', () => ({
  semanticSearch: (...args: unknown[]) => mockSemanticSearch(...args),
}))

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    chatSession: {
      upsert: vi.fn().mockResolvedValue({ id: 'session_1' }),
      update: vi.fn().mockResolvedValue({ id: 'session_1' }),
    },
    chatMessage: {
      create: vi.fn().mockResolvedValue({ id: 'msg_1' }),
      findMany: vi.fn().mockResolvedValue([
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '您好' },
      ]),
    },
    ...overrides,
  }
}

function createMockStreamResponse(text: string) {
  const encoder = new TextEncoder()
  const chunks = text.split('').map((char) => encoder.encode(char))
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    }),
    { status: 200, headers: new Headers({ 'Content-Type': 'text/plain' }) },
  )
}

function createMockReply() {
  const chunks: (string | Uint8Array)[] = []
  const reply: any = {
    type: vi.fn().mockReturnThis(),
    code: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    send: vi.fn((body: unknown) => {
      reply._body = body
      return reply
    }),
    raw: {
      write: vi.fn((chunk: string | Uint8Array) => chunks.push(chunk)),
      end: vi.fn(),
    },
    sent: false,
    _chunks: chunks,
  }
  return reply
}

function createMockRequest(body: Record<string, unknown>, prisma: unknown) {
  return {
    body,
    user: { id: 'user_1', tenantId: 'tenant_1', role: 'SALES', orgId: 'org_1' },
    tenantPrisma: prisma,
    id: 'req_1',
  } as any
}

describe('chat.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStreamText.mockReset()
    mockRouteIntent.mockReset()
    mockResolveSkills.mockReset()
    mockSkillExecute.mockReset()
    mockBuildSystemPrompt.mockReset()
    mockSemanticSearch.mockReset()
    mockScanOutput.mockReset()
    mockFindExpert.mockReset()
    mockAppendMessage.mockReset()

    mockBuildSystemPrompt.mockResolvedValue('system prompt')
    mockSemanticSearch.mockResolvedValue([])
    mockScanOutput.mockReturnValue({ passed: true, violations: [], severity: 'warn' })
    mockFindExpert.mockReturnValue(undefined)
    mockAppendMessage.mockResolvedValue(undefined)
  })

  it('streams response with skill results and kb chunks injected', async () => {
    const prisma = createMockPrisma()
    const req = createMockRequest(
      {
        messages: [{ role: 'user', content: '分析这个商机' }],
        sessionId: 'session_1',
        pageContext: { page: 'projects', entityType: 'project', entityId: 'project_1' },
      },
      prisma,
    )
    const reply = createMockReply()

    mockRouteIntent.mockResolvedValue({
      intent: 'demand_mining',
      confidence: 0.9,
      entityType: undefined,
      parameters: {},
    })

    mockResolveSkills.mockReturnValue([
      { skillId: 'project-query', params: { action: 'detail', projectId: 'project_1' }, reason: '' },
    ])

    mockSkillExecute.mockResolvedValue({
      success: true,
      data: { name: '测试商机', stage: 3 },
    })

    mockSemanticSearch.mockResolvedValue([
      { fileName: '方法论.pdf', similarity: 0.92, content: '需求挖掘技巧' },
    ])

    mockStreamText.mockReturnValue({
      toTextStreamResponse: () => createMockStreamResponse('建议重点关注决策链'),
    })

    await chat(req, reply)

    expect(mockRouteIntent).toHaveBeenCalledWith('分析这个商机', expect.objectContaining({ traceId: 'req_1' }))
    expect(mockResolveSkills).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'demand_mining' }),
      expect.objectContaining({ entityType: 'project', entityId: 'project_1' }),
    )
    expect(mockSkillExecute).toHaveBeenCalledWith(
      'project-query',
      expect.objectContaining({ action: 'detail' }),
      expect.objectContaining({ userId: 'user_1', tenantId: 'tenant_1' }),
    )
    expect(mockSemanticSearch).toHaveBeenCalledWith('tenant_1', '分析这个商机', 3, 'user_1', 'org_1')
    expect(reply.raw.end).toHaveBeenCalled()

    const decoder = new TextDecoder()
    const output = reply._chunks.map((c) => (typeof c === 'string' ? c : decoder.decode(c))).join('')
    expect(output).toContain('建议重点关注决策链')

    expect(prisma.chatMessage.create).toHaveBeenCalled()
    expect(prisma.chatSession.update).toHaveBeenCalled()
  })

  it('refuses when intent is not allowed and confidence is very low', async () => {
    const prisma = createMockPrisma()
    const req = createMockRequest({ messages: [{ role: 'user', content: '讲个笑话' }] }, prisma)
    const reply = createMockReply()

    mockRouteIntent.mockResolvedValue({
      intent: 'not_allowed',
      confidence: 0.1,
      entityType: undefined,
      parameters: {},
    })

    await chat(req, reply)

    expect(reply.type).toHaveBeenCalledWith('text/plain; charset=utf-8')
    expect(reply.send).toHaveBeenCalledWith(expect.stringContaining('销售管理助手'))
    expect(mockStreamText).not.toHaveBeenCalled()
    expect(mockAppendMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ role: 'assistant' }),
    )
  })

  it('returns clarification when intent is clarification', async () => {
    const prisma = createMockPrisma()
    const req = createMockRequest({ messages: [{ role: 'user', content: '帮我看看' }] }, prisma)
    const reply = createMockReply()

    mockRouteIntent.mockResolvedValue({
      intent: 'clarification',
      confidence: 0.5,
      entityType: 'visit_analysis',
      parameters: {},
    })

    await chat(req, reply)

    expect(reply.send).toHaveBeenCalledWith(expect.stringContaining('拜访复盘'))
    expect(mockStreamText).not.toHaveBeenCalled()
  })

  it('throws 403 when tenant context is missing', async () => {
    const req = createMockRequest({ messages: [{ role: 'user', content: 'test' }] }, undefined)
    const reply = createMockReply()

    await expect(chat(req, reply)).rejects.toMatchObject({
      statusCode: 403,
      message: '租户上下文缺失',
    })
  })

  it('throws 503 when AI config is missing', async () => {
    const { getAIConfig } = await import('../../../src/config/ai-config.js')
    vi.mocked(getAIConfig).mockReturnValueOnce({ openaiApiKey: '', modelName: '', provider: '' } as any)

    const prisma = createMockPrisma()
    const req = createMockRequest({ messages: [{ role: 'user', content: 'test' }] }, prisma)
    const reply = createMockReply()

    await expect(chat(req, reply)).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('AI 模型未配置'),
    })
  })
})
