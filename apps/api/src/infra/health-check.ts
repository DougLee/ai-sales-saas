import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { Redis } from 'ioredis'
import { getPackageVersion } from '../lib/version.js'

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error'
  version: string
  checks: {
    database: { ok: boolean; latencyMs: number; error?: string }
    redis: { ok: boolean; latencyMs: number; error?: string }
  }
}

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message }
  }
}

async function checkRedis(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000 })
  try {
    await redis.connect()
    await redis.ping()
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message }
  } finally {
    await redis.quit().catch(() => {})
  }
}

export async function performHealthCheck(): Promise<HealthCheckResult> {
  const version = getPackageVersion()
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()])

  const allOk = database.ok && redis.ok
  const status = allOk ? 'ok' : 'error'

  return {
    status,
    version,
    checks: { database, redis },
  }
}
