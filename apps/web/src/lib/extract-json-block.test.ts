import { describe, it, expect } from 'vitest'
import { extractJsonBlock } from './extract-json-block.js'

describe('extractJsonBlock', () => {
  it('extracts standard markdown json code block', () => {
    const content = '这是分析结果\n```json\n{"foo": "bar"}\n```\n后续说明'
    const result = extractJsonBlock(content)
    expect(result.json).toEqual({ foo: 'bar' })
    expect(result.text).toContain('这是分析结果')
    expect(result.text).not.toContain('```')
  })

  it('extracts generic code block when content is a json object', () => {
    const content = '```\n{"hello": "world"}\n```'
    const result = extractJsonBlock(content)
    expect(result.json).toEqual({ hello: 'world' })
  })

  it('ignores generic code block when it is an array', () => {
    const content = '```\n[1, 2, 3]\n```'
    const result = extractJsonBlock(content)
    // arrays are rejected in generic block path; falls through to bare-brace path
    expect(result.json).toBeNull()
  })

  it('extracts bare json object without code fences', () => {
    const content = '前缀 {"a": 1, "b": 2} 后缀'
    const result = extractJsonBlock(content)
    expect(result.json).toEqual({ a: 1, b: 2 })
    expect(result.text).toContain('前缀')
    expect(result.text).toContain('后缀')
  })

  it('returns null json when there is no json', () => {
    const content = '这是一段纯文本，没有任何 JSON。'
    const result = extractJsonBlock(content)
    expect(result.json).toBeNull()
    expect(result.intent).toBeNull()
    expect(result.text).toBe(content)
  })

  it('returns null json when json block is invalid', () => {
    const content = '```json\n{invalid json}\n```'
    const result = extractJsonBlock(content)
    expect(result.json).toBeNull()
  })

  it('infers visit_analysis intent', () => {
    const content = '```json\n{"people": {}, "spinAssessment": {}}\n```'
    const result = extractJsonBlock(content)
    expect(result.intent).toBe('visit_analysis')
  })

  it('infers background_research intent', () => {
    const content = '```json\n{"customerProfile": {}, "decisionChain": []}\n```'
    const result = extractJsonBlock(content)
    expect(result.intent).toBe('background_research')
  })

  it('infers team_management intent', () => {
    const content = '```json\n{"pipelineOverview": {}, "teamComparison": []}\n```'
    const result = extractJsonBlock(content)
    expect(result.intent).toBe('team_management')
  })

  it('returns null intent for unrecognized json shape', () => {
    const content = '```json\n{"random": 1}\n```'
    const result = extractJsonBlock(content)
    expect(result.json).toEqual({ random: 1 })
    expect(result.intent).toBeNull()
  })
})
