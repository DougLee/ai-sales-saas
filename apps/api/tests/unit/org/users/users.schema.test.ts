import { describe, it, expect } from 'vitest'
import { ListUsersQuerySchema, UpdateUserBodySchema } from '../../../../src/org/users/users.schema.js'

describe('users.schema', () => {
  describe('ListUsersQuerySchema', () => {
    it('parses minimal query', () => {
      const result = ListUsersQuerySchema.parse({})
      expect(result).toEqual({ page: 1, pageSize: 50 })
    })

    it('parses full query', () => {
      const result = ListUsersQuerySchema.parse({
        role: 'SALES',
        status: 'active',
        search: 'test',
        page: '2',
        pageSize: '20',
      })
      expect(result).toEqual({
        role: 'SALES',
        status: 'active',
        search: 'test',
        page: 2,
        pageSize: 20,
      })
    })

    it('rejects invalid role', () => {
      expect(() => ListUsersQuerySchema.parse({ role: 'INVALID' })).toThrow()
    })

    it('rejects pageSize above max 100', () => {
      expect(() => ListUsersQuerySchema.parse({ pageSize: 200 })).toThrow()
    })
  })

  describe('UpdateUserBodySchema', () => {
    it('parses partial update', () => {
      const result = UpdateUserBodySchema.parse({ name: 'New Name' })
      expect(result).toEqual({ name: 'New Name' })
    })

    it('rejects too long name', () => {
      expect(() => UpdateUserBodySchema.parse({ name: 'a'.repeat(51) })).toThrow()
    })

    it('allows empty object', () => {
      const result = UpdateUserBodySchema.parse({})
      expect(result).toEqual({})
    })
  })
})
