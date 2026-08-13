import pino from 'pino'
import { env } from '../config/env.js'
import { getPackageVersion } from '../lib/version.js'

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: env.SERVICE_NAME,
    version: env.SERVICE_VERSION || getPackageVersion(),
    pid: process.pid,
  },
  redact: {
    paths: [
      '*.authorization',
      '*.apiKey',
      '*.token',
      '*.password',
      '*.secret',
      '*.jwtSecret',
      '*.accessKey',
      '*.secretKey',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

export interface LoggerContext {
  traceId?: string
  sessionId?: string
  userId?: string
  tenantId?: string
  orgId?: string
}

/**
 * 按组件创建子日志器，统一携带上下文字段
 */
export function getComponentLogger(component: string, ctx?: LoggerContext) {
  return logger.child({ component, ...ctx })
}
