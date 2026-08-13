import { describe, it, expect } from 'vitest'
import { AppError, isAppError } from '../../../src/errors/app-error.js'
import { ErrorCode, ALERTABLE_ERROR_CODES } from '../../../src/errors/error-codes.js'

describe('AppError', () => {
  it('should preserve code, message, statusCode and details', () => {
    const err = new AppError(ErrorCode.AI_SERVICE_ERROR, 'AI 服务不可用', 503, { provider: 'test' })

    expect(err.code).toBe(ErrorCode.AI_SERVICE_ERROR)
    expect(err.message).toBe('AI 服务不可用')
    expect(err.statusCode).toBe(503)
    expect(err.details).toEqual({ provider: 'test' })
    expect(err.name).toBe('AppError')
  })

  it('isAppError returns true for AppError', () => {
    const err = new AppError(ErrorCode.BAD_REQUEST, 'bad', 400)
    expect(isAppError(err)).toBe(true)
  })

  it('isAppError returns false for plain Error', () => {
    expect(isAppError(new Error('plain'))).toBe(false)
    expect(isAppError(null)).toBe(false)
    expect(isAppError('string')).toBe(false)
  })

  it('marks alertable error codes automatically', () => {
    const aiErr = new AppError(ErrorCode.AI_SERVICE_ERROR, 'AI failed', 502)
    const dbErr = new AppError(ErrorCode.DATABASE_ERROR, 'DB failed', 500)
    const internalErr = new AppError(ErrorCode.INTERNAL_ERROR, 'Oops', 500)

    expect(aiErr.alertable).toBe(true)
    expect(dbErr.alertable).toBe(true)
    expect(internalErr.alertable).toBe(true)
  })

  it('does not mark client error codes as alertable by default', () => {
    const badRequest = new AppError(ErrorCode.BAD_REQUEST, 'bad', 400)
    const validation = new AppError(ErrorCode.VALIDATION_ERROR, 'invalid', 400)
    const auth = new AppError(ErrorCode.AUTHENTICATION_ERROR, 'unauthorized', 401)

    expect(badRequest.alertable).toBe(false)
    expect(validation.alertable).toBe(false)
    expect(auth.alertable).toBe(false)
  })

  it('allows overriding alertable flag explicitly', () => {
    const err = new AppError(ErrorCode.BAD_REQUEST, 'bad', 400, undefined, true)
    expect(err.alertable).toBe(true)
  })

  it('preserves traceId when provided', () => {
    const err = new AppError(ErrorCode.AI_SERVICE_ERROR, 'AI failed', 502, undefined, true, 'trace-123')
    expect(err.traceId).toBe('trace-123')
  })
})

describe('ALERTABLE_ERROR_CODES', () => {
  it('contains critical server-side error codes', () => {
    expect(ALERTABLE_ERROR_CODES.has(ErrorCode.AI_SERVICE_ERROR)).toBe(true)
    expect(ALERTABLE_ERROR_CODES.has(ErrorCode.DATABASE_ERROR)).toBe(true)
    expect(ALERTABLE_ERROR_CODES.has(ErrorCode.EXTERNAL_SERVICE_ERROR)).toBe(true)
    expect(ALERTABLE_ERROR_CODES.has(ErrorCode.INTERNAL_ERROR)).toBe(true)
  })

  it('does not contain client error codes', () => {
    expect(ALERTABLE_ERROR_CODES.has(ErrorCode.BAD_REQUEST)).toBe(false)
    expect(ALERTABLE_ERROR_CODES.has(ErrorCode.VALIDATION_ERROR)).toBe(false)
    expect(ALERTABLE_ERROR_CODES.has(ErrorCode.AUTHENTICATION_ERROR)).toBe(false)
  })
})
