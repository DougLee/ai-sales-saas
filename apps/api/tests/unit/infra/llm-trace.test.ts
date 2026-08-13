import { describe, it, expect, vi } from 'vitest'
import { traceLLMCall, logToolTrace } from '../../../src/infra/llm-trace.js'
import { getComponentLogger } from '../../../src/infra/logger.js'

describe('traceLLMCall', () => {
  it('records latency and returns trace metadata on success', async () => {
    const { result, trace } = await traceLLMCall(
      {
        component: 'test-llm',
        model: 'gpt-test',
        provider: 'openai',
        traceId: 'trace-123',
        sessionId: 'sess-456',
        userId: 'user-789',
        tenantId: 'tenant-abc',
      },
      async () => ({
        result: { text: 'hello' },
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      }),
    )

    expect(result).toEqual({ text: 'hello' })
    expect(trace.traceId).toBe('trace-123')
    expect(trace.model).toBe('gpt-test')
    expect(trace.provider).toBe('openai')
    expect(trace.latencyMs).toBeGreaterThanOrEqual(0)
    expect(trace.promptTokens).toBe(10)
    expect(trace.completionTokens).toBe(5)
    expect(trace.totalTokens).toBe(15)
  })

  it('generates traceId when not provided', async () => {
    const { trace } = await traceLLMCall(
      { component: 'test-llm', model: 'gpt-test' },
      async () => ({ result: 'ok' }),
    )

    expect(trace.traceId).toBeDefined()
    expect(trace.traceId.length).toBeGreaterThan(0)
  })

  it('re-throws error and records failed trace', async () => {
    await expect(
      traceLLMCall(
        { component: 'test-llm', model: 'gpt-test', traceId: 'trace-fail' },
        async () => {
          throw new Error('LLM failed')
        },
      ),
    ).rejects.toThrow('LLM failed')
  })
})

describe('logToolTrace', () => {
  it('logs successful tool execution', () => {
    const logger = getComponentLogger('test-tool')
    const infoSpy = vi.spyOn(logger, 'info')

    logToolTrace(logger, 'testTool', 42, { sessionId: 'sess-1', input: { x: 1 } })

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: expect.objectContaining({
          name: 'testTool',
          durationMs: 42,
        }),
        sessionId: 'sess-1',
      }),
      'Tool execution completed',
    )
  })

  it('logs failed tool execution at error level', () => {
    const logger = getComponentLogger('test-tool')
    const errorSpy = vi.spyOn(logger, 'error')

    logToolTrace(logger, 'testTool', 42, { sessionId: 'sess-1', error: 'boom' })

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: expect.objectContaining({
          name: 'testTool',
          durationMs: 42,
          error: 'boom',
        }),
        sessionId: 'sess-1',
      }),
      'Tool execution failed',
    )
  })
})
