import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { ALERTABLE_ERROR_CODES, ErrorCode } from '../errors/error-codes.js'
import { AppError, isAppError } from '../errors/app-error.js'

/**
 * 将 Fastify 内置错误码映射为业务错误码
 */
function mapFastifyCodeToErrorCode(code?: string): ErrorCode {
  switch (code) {
    case 'FST_JWT_NO_AUTHORIZATION_IN_HEADER':
    case 'FST_JWT_AUTHORIZATION_TOKEN_INVALID':
    case 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED':
      return ErrorCode.AUTHENTICATION_ERROR
    case 'FST_ERR_NOT_FOUND':
      return ErrorCode.NOT_FOUND
    default:
      return ErrorCode.INTERNAL_ERROR
  }
}

function getStatusCodeFromFastifyCode(code?: string): number {
  switch (code) {
    case 'FST_JWT_NO_AUTHORIZATION_IN_HEADER':
    case 'FST_JWT_AUTHORIZATION_TOKEN_INVALID':
    case 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED':
      return 401
    case 'FST_ERR_NOT_FOUND':
      return 404
    default:
      return 500
  }
}

function isAIServiceError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const name = err.name || ''
  const message = err.message || ''
  return (
    name.includes('AI_') ||
    name.includes('APICallError') ||
    name.includes('LoadAPIError') ||
    message.includes('fetch failed') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('socket hang up')
  )
}

function buildErrorResponse(
  err: unknown,
  statusCode: number,
  requestId: string,
): { success: false; error: { code: ErrorCode; message: string; details?: unknown; requestId: string; stack?: string } } {
  const isDev = process.env.NODE_ENV === 'development'

  if (isAppError(err)) {
    return {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
        ...(isDev ? { stack: err.stack } : {}),
      },
    }
  }

  if (err instanceof ZodError) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: err.issues,
        requestId,
      },
    }
  }

  if (err instanceof Error && isAIServiceError(err)) {
    return {
      success: false,
      error: {
        code: ErrorCode.AI_SERVICE_ERROR,
        message: 'AI 服务调用失败，请稍后重试',
        requestId,
        ...(isDev ? { details: err.message, stack: err.stack } : {}),
      },
    }
  }

  const fastifyErr = err as FastifyError
  const code = mapFastifyCodeToErrorCode(fastifyErr.code)
  const resolvedStatusCode = fastifyErr.statusCode || getStatusCodeFromFastifyCode(fastifyErr.code) || statusCode

  return {
    success: false,
    error: {
      code,
      message: resolvedStatusCode >= 500 && !isDev ? '服务器内部错误' : (fastifyErr.message || '服务器内部错误'),
      requestId,
      ...(isDev ? { stack: fastifyErr.stack } : {}),
    },
  }
}

interface LogContext {
  err?: unknown
  requestId: string
  code: ErrorCode
  alertable?: boolean
  severity?: 'critical' | 'warning'
  traceId?: string
}

function buildLogContext(err: unknown, requestId: string): LogContext {
  let code: ErrorCode = ErrorCode.INTERNAL_ERROR
  let alertable = false
  let traceId: string | undefined

  if (isAppError(err)) {
    code = err.code
    alertable = err.alertable
    traceId = err.traceId
  } else if (err instanceof Error && isAIServiceError(err)) {
    code = ErrorCode.AI_SERVICE_ERROR
    alertable = ALERTABLE_ERROR_CODES.has(code)
  } else if ((err as FastifyError).code) {
    code = mapFastifyCodeToErrorCode((err as FastifyError).code)
    alertable = ALERTABLE_ERROR_CODES.has(code)
  }

  return {
    err,
    requestId,
    code,
    alertable,
    severity: alertable ? 'critical' : undefined,
    traceId,
  }
}

export function errorHandler(
  err: FastifyError,
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const requestId = req.id || 'unknown'

  // AI 服务类错误统一包装为 AppError 处理逻辑
  if (err instanceof Error && isAIServiceError(err) && !(err instanceof AppError)) {
    const logCtx = buildLogContext(err, requestId)
    req.log.warn(logCtx, 'AI service error detected')
    const response = buildErrorResponse(err, 502, requestId)
    return reply.status(502).send(response)
  }

  if (err instanceof ZodError) {
    req.log.warn({ requestId, code: ErrorCode.VALIDATION_ERROR }, 'Validation error')
    const response = buildErrorResponse(err, 400, requestId)
    return reply.status(400).send(response)
  }

  if (isAppError(err)) {
    const logCtx = buildLogContext(err, requestId)
    if (err.statusCode >= 500) {
      req.log.error(logCtx, 'Application error')
    } else {
      req.log.warn(logCtx, 'Application error')
    }
    const response = buildErrorResponse(err, err.statusCode, requestId)
    return reply.status(err.statusCode).send(response)
  }

  const fastifyErr = err as FastifyError
  const statusCode = fastifyErr.statusCode || getStatusCodeFromFastifyCode(fastifyErr.code) || 500

  if (statusCode >= 500) {
    const logCtx = buildLogContext(err, requestId)
    req.log.error(logCtx, 'Unhandled server error')
  }

  const response = buildErrorResponse(err, statusCode, requestId)
  return reply.status(statusCode).send(response)
}
