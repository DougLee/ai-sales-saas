import { ALERTABLE_ERROR_CODES, ErrorCode } from './error-codes.js'

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly details?: unknown
  public readonly alertable: boolean
  public readonly traceId?: string

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: unknown,
    alertable?: boolean,
    traceId?: string,
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
    this.alertable = alertable ?? ALERTABLE_ERROR_CODES.has(code)
    this.traceId = traceId
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}
