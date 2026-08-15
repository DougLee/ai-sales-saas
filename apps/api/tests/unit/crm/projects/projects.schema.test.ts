import { describe, it, expect } from 'vitest'
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ListProjectsQuerySchema,
} from '../../../../src/crm/projects/projects.schema.js'

describe('projects.schema', () => {
  describe('CreateProjectSchema', () => {
    it('parses minimal valid project', () => {
      const result = CreateProjectSchema.parse({ name: 'Test Project', companyId: 'company_1' })
      expect(result).toMatchObject({
        name: 'Test Project',
        companyId: 'company_1',
        industry: 'education',
        milestone: 0,
        urgency: 'MEDIUM',
      })
    })

    it('parses full project', () => {
      const result = CreateProjectSchema.parse({
        name: 'Full Project',
        companyId: 'company_1',
        industry: 'government',
        amount: 100000,
        milestone: 3,
        urgency: 'HIGH',
        healthScore: 80,
        notes: 'note',
      })
      expect(result).toMatchObject({
        name: 'Full Project',
        companyId: 'company_1',
        milestone: 3,
        urgency: 'HIGH',
        healthScore: 80,
      })
    })

    it('rejects empty name', () => {
      expect(() => CreateProjectSchema.parse({ name: '', companyId: 'company_1' })).toThrow()
    })

    it('rejects milestone out of range', () => {
      expect(() => CreateProjectSchema.parse({ name: 'Test', companyId: 'company_1', milestone: 9 })).toThrow()
    })
  })

  describe('UpdateProjectSchema', () => {
    it('allows partial update', () => {
      const result = UpdateProjectSchema.parse({ amount: 50000 })
      expect(result).toEqual({ amount: 50000 })
    })

    it('allows empty object', () => {
      const result = UpdateProjectSchema.parse({})
      expect(result).toEqual({})
    })

    it('accepts decisionMap (P0-2: M6 门禁字段打通)', () => {
      const decisionMap = { nodes: [{ id: 'n1', name: '张三', role: 'DECISION_MAKER' }], relations: [] }
      const result = UpdateProjectSchema.parse({ decisionMap })
      expect(result.decisionMap).toEqual(decisionMap)
    })

    it('accepts evidence (P0-2: M7 门禁字段打通)', () => {
      const evidence = { bidResult: 'won', _gateFieldSource: { 'evidence.bidResult': 'manual-pass' } }
      const result = UpdateProjectSchema.parse({ evidence })
      expect(result.evidence).toEqual(evidence)
    })

    it('accepts decisionMap and evidence alongside milestone in one request (P0-1 单请求推进)', () => {
      const result = UpdateProjectSchema.parse({
        milestone: 7,
        humanInfo: { firstContact: '电话' },
        decisionMap: { nodes: [{ id: 'n1' }] },
        evidence: { bidResult: 'won' },
      })
      expect(result.milestone).toBe(7)
      expect(result.decisionMap).toEqual({ nodes: [{ id: 'n1' }] })
      expect(result.evidence).toEqual({ bidResult: 'won' })
    })

    it('rejects non-record decisionMap', () => {
      expect(() => UpdateProjectSchema.parse({ decisionMap: 'not-a-record' })).toThrow()
    })
  })

  describe('ListProjectsQuerySchema', () => {
    it('parses defaults', () => {
      const result = ListProjectsQuerySchema.parse({})
      expect(result).toEqual({ page: 1, pageSize: 20 })
    })

    it('parses string numbers', () => {
      const result = ListProjectsQuerySchema.parse({ milestone: '3', page: '2', pageSize: '50' })
      expect(result).toEqual({ milestone: 3, page: 2, pageSize: 50 })
    })

    it('rejects invalid urgency', () => {
      expect(() => ListProjectsQuerySchema.parse({ urgency: 'INVALID' })).toThrow()
    })
  })
})
