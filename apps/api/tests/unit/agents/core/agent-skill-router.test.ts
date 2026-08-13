import { describe, it, expect } from 'vitest'
import { resolveSkills } from '../../../../src/agents/core/agent-skill-router.js'
import type { IntentResult } from '../../../../src/agents/core/agent-types.js'

function makeIntent(intent: string, parameters: Record<string, unknown> = {}): IntentResult {
  return { intent, confidence: 0.9, parameters }
}

describe('agent-skill-router', () => {
  it('visit_analysis with entityType=visit triggers visit-analysis skill', () => {
    const calls = resolveSkills(makeIntent('visit_analysis'), {
      entityType: 'visit',
      entityId: 'visit_1',
    })

    const visitAnalysisCall = calls.find((c) => c.skillId === 'visit-analysis')
    expect(visitAnalysisCall).toBeDefined()
    expect(visitAnalysisCall?.params).toEqual({ visitId: 'visit_1' })
  })

  it('visit_analysis with visitId parameter triggers visit-analysis skill', () => {
    const calls = resolveSkills(makeIntent('visit_analysis', { visitId: 'visit_2' }), {
      entityType: 'project',
      entityId: 'project_1',
    })

    const visitAnalysisCall = calls.find((c) => c.skillId === 'visit-analysis')
    expect(visitAnalysisCall).toBeDefined()
    expect(visitAnalysisCall?.params).toEqual({ visitId: 'visit_2' })
  })

  it('visit_analysis without visitId falls back to visit-query search', () => {
    const calls = resolveSkills(makeIntent('visit_analysis'), {
      entityType: 'project',
      entityId: 'project_1',
    })

    expect(calls.some((c) => c.skillId === 'visit-analysis')).toBe(false)
    const visitQueryCall = calls.find((c) => c.skillId === 'visit-query')
    expect(visitQueryCall).toBeDefined()
    expect(visitQueryCall?.params).toEqual({ action: 'search', projectId: 'project_1' })
  })

  it('visit_analysis still loads project detail and health', () => {
    const calls = resolveSkills(makeIntent('visit_analysis', { visitId: 'visit_1' }), {
      entityType: 'project',
      entityId: 'project_1',
    })

    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'detail')).toBe(true)
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'health')).toBe(true)
    expect(calls.some((c) => c.skillId === 'kb-search')).toBe(true)
  })

  it('visit_preparation triggers visit-query but not visit-analysis', () => {
    const calls = resolveSkills(makeIntent('visit_preparation'), {
      entityType: 'project',
      entityId: 'project_1',
    })

    expect(calls.some((c) => c.skillId === 'visit-query')).toBe(true)
    expect(calls.some((c) => c.skillId === 'visit-analysis')).toBe(false)
  })

  it('project entity triggers project-query detail', () => {
    const calls = resolveSkills(makeIntent('general_chat'), {
      entityType: 'project',
      entityId: 'project_1',
    })
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'detail')).toBe(true)
  })

  it('lead entity triggers lead-query', () => {
    const calls = resolveSkills(makeIntent('general_chat'), {
      entityType: 'lead',
      entityId: 'lead_1',
    })
    expect(calls.some((c) => c.skillId === 'lead-query')).toBe(true)
  })

  it('background_research triggers web-search, company-query, kb-search', () => {
    const calls = resolveSkills(makeIntent('background_research', { targetName: 'ABC' }))
    expect(calls.some((c) => c.skillId === 'web-search')).toBe(true)
    expect(calls.some((c) => c.skillId === 'company-query')).toBe(true)
    expect(calls.some((c) => c.skillId === 'kb-search')).toBe(true)
  })

  it('territory_search triggers web-search and company-query', () => {
    const calls = resolveSkills(makeIntent('territory_search', { region: '北京' }))
    expect(calls.some((c) => c.skillId === 'web-search')).toBe(true)
    expect(calls.some((c) => c.skillId === 'company-query')).toBe(true)
  })

  it('demand_mining triggers project-query detail and health', () => {
    const calls = resolveSkills(makeIntent('demand_mining'), {
      entityType: 'project',
      entityId: 'project_1',
    })
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'detail')).toBe(true)
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'health')).toBe(true)
  })

  it('lead_assessment triggers lead-query and kb-search', () => {
    const calls = resolveSkills(makeIntent('lead_assessment', { targetName: 'Lead' }))
    expect(calls.some((c) => c.skillId === 'lead-query')).toBe(true)
    expect(calls.some((c) => c.skillId === 'kb-search')).toBe(true)
  })

  it('team_management triggers briefing-query and project-query search', () => {
    const calls = resolveSkills(makeIntent('team_management'))
    expect(calls.some((c) => c.skillId === 'briefing-query')).toBe(true)
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'search')).toBe(true)
  })

  it('illusion_detection triggers project-query health and kb-search', () => {
    const calls = resolveSkills(makeIntent('illusion_detection'), {
      entityType: 'project',
      entityId: 'project_1',
    })
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'health')).toBe(true)
    expect(calls.some((c) => c.skillId === 'kb-search')).toBe(true)
  })

  it('bidding_monitor triggers web-search', () => {
    const calls = resolveSkills(makeIntent('bidding_monitor', { targetName: '招标' }))
    expect(calls.some((c) => c.skillId === 'web-search')).toBe(true)
  })

  it('sales_coaching triggers kb-search', () => {
    const calls = resolveSkills(makeIntent('sales_coaching'))
    expect(calls.some((c) => c.skillId === 'kb-search')).toBe(true)
  })

  it('returns empty for unhandled intent', () => {
    const calls = resolveSkills(makeIntent('system_help'))
    expect(calls).toEqual([])
  })

  it('deduplicates same skill calls', () => {
    const calls = resolveSkills(makeIntent('demand_mining'), {
      entityType: 'project',
      entityId: 'project_1',
    })
    const detailCalls = calls.filter((c) => c.skillId === 'project-query' && c.params.action === 'detail')
    expect(detailCalls.length).toBe(1)
  })

  // === project_health（标杆用例：河南大学商机评分怎么提升）===

  it('project_health with page entityId triggers detail + health + visit-query', () => {
    const calls = resolveSkills(makeIntent('project_health'), {
      entityType: 'project',
      entityId: 'project_1',
    })
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'detail' && c.params.projectId === 'project_1')).toBe(true)
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'health' && c.params.projectId === 'project_1')).toBe(true)
    expect(calls.some((c) => c.skillId === 'visit-query' && c.params.projectId === 'project_1')).toBe(true)
  })

  it('project_health with targetName only resolves project by keyword', () => {
    const calls = resolveSkills(makeIntent('project_health', { targetName: '河南大学' }))
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'detail' && c.params.keyword === '河南大学')).toBe(true)
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'health' && c.params.keyword === '河南大学')).toBe(true)
  })

  it('project_health without entity falls back to project search overview', () => {
    const calls = resolveSkills(makeIntent('project_health'))
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'search')).toBe(true)
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'detail')).toBe(false)
  })

  it('follow_up with targetName but no entityId uses keyword resolution', () => {
    const calls = resolveSkills(makeIntent('follow_up', { targetName: '黄淮学院' }))
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.keyword === '黄淮学院')).toBe(true)
  })

  it('follow_up without entity and targetName pushes no project-query (no undefined projectId)', () => {
    const calls = resolveSkills(makeIntent('follow_up'))
    const pq = calls.filter((c) => c.skillId === 'project-query')
    expect(pq).toEqual([])
  })

  it('illusion_detection with targetName resolves by keyword', () => {
    const calls = resolveSkills(makeIntent('illusion_detection', { targetName: '某学院' }))
    expect(calls.some((c) => c.skillId === 'project-query' && c.params.action === 'health' && c.params.keyword === '某学院')).toBe(true)
  })
})
