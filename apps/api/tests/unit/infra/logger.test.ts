import { describe, it, expect } from 'vitest'
import { getPackageVersion } from '../../../src/lib/version.js'
import { getComponentLogger } from '../../../src/infra/logger.js'

describe('getPackageVersion', () => {
  it('returns semantic version from package.json', () => {
    const version = getPackageVersion()
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('returns a non-empty string', () => {
    expect(getPackageVersion().length).toBeGreaterThan(0)
  })
})

describe('getComponentLogger', () => {
  it('creates child logger with component and context fields', () => {
    const child = getComponentLogger('test-component', {
      traceId: 'trace-123',
      sessionId: 'sess-456',
      userId: 'user-789',
      tenantId: 'tenant-abc',
    })

    expect(child).toBeDefined()
    // pino child logger 会继承 bindings，这里只验证 logger 可被调用
    expect(() => child.info('test message')).not.toThrow()
  })
})
