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
