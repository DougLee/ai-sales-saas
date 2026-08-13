import { describe, it, expect, vi } from 'vitest'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { ZodError, z } from 'zod'
import { errorHandler } from '../../../src/infra/error-handler.js'
import { AppError } from '../../../src/errors/app-error.js'
import { ErrorCode } from '../../../src/errors/error-codes.js'

function mockReply(): FastifyReply {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply
}

function mockRequest(overrides?: Partial<FastifyRequest>): FastifyRequest {
  return {
    id: 'req-123',
    log: { warn: vi.fn(), error: vi.fn() },
    ...overrides,
  } as unknown as FastifyRequest
}

describe('errorHandler', () => {
  it('returns structured validation error for ZodError', () => {
    const schema = z.object({ name: z.string() })
    const err = schema.safeParse({ name: 123 }).error as ZodError
    const req = mockRequest()
    const reply = mockReply()

    errorHandler(err as unknown as Parameters<typeof errorHandler>[0], req, reply)

    expect(reply.status).toHaveBeenCalledWith(400)
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: ErrorCode.VALIDATION_ERROR,
          message: '参数校验失败',
          requestId: 'req-123',
        }),
      }),
    )
  })

  it('uses AppError code and statusCode', () => {
    const err = new AppError(ErrorCode.AI_SERVICE_ERROR, '模型服务超时', 504)
    const req = mockRequest()
    const reply = mockReply()

    errorHandler(err as unknown as Parameters<typeof errorHandler>[0], req, reply)

    expect(reply.status).toHaveBeenCalledWith(504)
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: ErrorCode.AI_SERVICE_ERROR,
          message: '模型服务超时',
          requestId: 'req-123',
        }),
      }),
    )
  })

  it('masks internal server errors in production', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const err = new Error('secret database password')
    const req = mockRequest()
    const reply = mockReply()

    errorHandler(err as unknown as Parameters<typeof errorHandler>[0], req, reply)

    expect(reply.status).toHaveBeenCalledWith(500)
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: ErrorCode.INTERNAL_ERROR,
          message: '服务器内部错误',
          requestId: 'req-123',
        }),
      }),
    )

    process.env.NODE_ENV = originalEnv
  })

  it('exposes internal server errors in development', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const err = new Error('dev details')
    const req = mockRequest()
    const reply = mockReply()

    errorHandler(err as unknown as Parameters<typeof errorHandler>[0], req, reply)

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: ErrorCode.INTERNAL_ERROR,
          message: 'dev details',
          requestId: 'req-123',
          stack: expect.any(String),
        }),
      }),
    )

    process.env.NODE_ENV = originalEnv
  })

  it('maps AI fetch errors to AI_SERVICE_ERROR', () => {
    const err = new Error('fetch failed: ECONNREFUSED 127.0.0.1:8000')
    const req = mockRequest()
    const reply = mockReply()

    errorHandler(err as unknown as Parameters<typeof errorHandler>[0], req, reply)

    expect(reply.status).toHaveBeenCalledWith(502)
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: ErrorCode.AI_SERVICE_ERROR,
          message: 'AI 服务调用失败，请稍后重试',
          requestId: 'req-123',
        }),
      }),
    )
  })

  it('marks alertable and severity for critical AppError', () => {
    const err = new AppError(ErrorCode.DATABASE_ERROR, '连接超时', 500)
    const req = mockRequest()
    const reply = mockReply()

    errorHandler(err as unknown as Parameters<typeof errorHandler>[0], req, reply)

    expect(req.log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-123',
        code: ErrorCode.DATABASE_ERROR,
        alertable: true,
        severity: 'critical',
      }),
      'Application error',
    )
  })

  it('does not mark alertable for client AppError', () => {
    const err = new AppError(ErrorCode.BAD_REQUEST, '参数错误', 400)
    const req = mockRequest()
    const reply = mockReply()

    errorHandler(err as unknown as Parameters<typeof errorHandler>[0], req, reply)

    expect(req.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-123',
        code: ErrorCode.BAD_REQUEST,
        alertable: false,
      }),
      'Application error',
    )
  })
})
