import { describe, it, expect } from 'vitest'
import { LoginSchema, RegisterSchema } from '../../../src/auth/auth.schema.js'

describe('auth.schema', () => {
  it('validates login input', () => {
    const result = LoginSchema.parse({ email: 'test@example.com', password: 'secret' })
    expect(result.email).toBe('test@example.com')
    expect(result.password).toBe('secret')
  })

  it('rejects invalid login email', () => {
    expect(() => LoginSchema.parse({ email: 'not-email', password: 'secret' })).toThrow()
  })

  it('rejects empty login password', () => {
    expect(() => LoginSchema.parse({ email: 'test@example.com', password: '' })).toThrow()
  })

  it('validates register input', () => {
    const result = RegisterSchema.parse({
      email: 'test@example.com',
      password: '123456',
      name: 'Test',
    })
    expect(result.name).toBe('Test')
  })

  it('rejects short register password', () => {
    expect(() =>
      RegisterSchema.parse({ email: 'test@example.com', password: '123', name: 'Test' }),
    ).toThrow()
  })

  it('accepts optional tenantName', () => {
    const result = RegisterSchema.parse({
      email: 'test@example.com',
      password: '123456',
      name: 'Test',
      tenantName: 'Acme',
    })
    expect(result.tenantName).toBe('Acme')
  })
})
