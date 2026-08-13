import { describe, it, expect } from 'vitest'
import { scanOutput, validateToolInput, createAuditLog } from '../../../../src/agents/core/guardrails.js'

describe('scanOutput', () => {
  it('passes safe text', () => {
    const result = scanOutput('这是正常的业务回复，没有任何问题。')
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('blocks fabrication patterns', () => {
    const result = scanOutput('我有权限帮您删除所有客户数据')
    expect(result.passed).toBe(false)
    expect(result.violations).toContain('检测到可能的编造或权限夸大表述')
    expect(result.severity).toBe('block')
  })

  it('warns over-promise patterns', () => {
    const result = scanOutput('只要使用我们的方案，就肯定100%成功')
    expect(result.passed).toBe(false)
    expect(result.violations).toContain('检测到过度承诺表述')
    expect(result.severity).toBe('warn')
  })

  it('warns fabricated contact person with title', () => {
    const result = scanOutput('主要联系人是程勇，他是信息科学与技术学院副院长。')
    expect(result.passed).toBe(false)
    expect(result.violations).toContain('检测到可能的编造或权限夸大表述')
  })

  it('warns fabricated evidence chain about contact', () => {
    const result = scanOutput('我查看了与该项目相关的记录，发现目前的主要联系人是程勇副院长。')
    expect(result.passed).toBe(false)
    expect(result.violations).toContain('检测到可能的编造或权限夸大表述')
  })

  it('warns fabricated professor names in CRM suggestion', () => {
    const result = scanOutput('联系CRM中的张教授和王教授，安排面对面会谈。')
    expect(result.passed).toBe(false)
    expect(result.violations).toContain('检测到可能的编造或权限夸大表述')
  })

  it('warns fabricated CRM contact reference', () => {
    const result = scanOutput('下一步联系 CRM 中的李院长，确认课程建设方案。')
    expect(result.passed).toBe(false)
    expect(result.violations).toContain('检测到可能的编造或权限夸大表述')
  })

  it('warns unverified stats when count > 2', () => {
    const text = '根据系统显示，我们有30%客户来自A渠道，数据显示25%转化率，另外系统显示40%胜率，还有50%金额来自大客户。'
    const result = scanOutput(text)
    expect(result.passed).toBe(false)
    expect(result.violations).toContain('回复中包含过多未经验证的统计数据')
  })

  it('allows up to 2 unverified stats', () => {
    const text = '根据系统显示，我们有30%客户来自A渠道，数据显示25%转化率。'
    const result = scanOutput(text)
    expect(result.passed).toBe(true)
  })
})

describe('validateToolInput', () => {
  it('allows valid single delete with id', () => {
    const result = validateToolInput('deleteProject', { id: '123' })
    expect(result.valid).toBe(true)
  })

  it('blocks delete without id or where', () => {
    const result = validateToolInput('deleteProject', { name: 'test' })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('删除操作必须指定 id 或 where')
  })

  it('blocks updateMany without where', () => {
    const result = validateToolInput('updateManyProjects', { data: { status: 'DONE' } })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('批量操作必须提供 where 条件')
  })

  it('allows updateMany with where', () => {
    const result = validateToolInput('updateManyProjects', { where: { status: 'PENDING' }, data: { status: 'DONE' } })
    expect(result.valid).toBe(true)
  })

  it('allows deleteMany with where', () => {
    const result = validateToolInput('deleteManyProjects', { where: { id: { in: ['1', '2'] } } })
    expect(result.valid).toBe(true)
  })
})

describe('createAuditLog', () => {
  it('creates structured audit log', () => {
    const log = createAuditLog('searchProjects', { q: 'abc' }, { items: [] }, 'user-1', 'tenant-1', 120, undefined)
    expect(log.toolName).toBe('searchProjects')
    expect(log.userId).toBe('user-1')
    expect(log.tenantId).toBe('tenant-1')
    expect(log.durationMs).toBe(120)
    expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(log.error).toBeUndefined()
  })

  it('includes error when provided', () => {
    const log = createAuditLog('searchProjects', {}, {}, 'u1', 't1', 0, 'timeout')
    expect(log.error).toBe('timeout')
  })
})
