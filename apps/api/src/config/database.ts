import { PrismaClient } from '@prisma/client'
import { withDataFoundation } from '../infra/prisma-extensions.js'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// #33 A3/A2：挂 Prisma Client Extension（query callback，6.x 正式支持）——
// Company/Lead/Project 的 create/update/delete 自动写 AuditLog；
// 父实体软删/硬删时级联软删关联 Visit。详见 src/infra/prisma-extensions.ts。
// 保留 controller 显式 logAudit（auth / AI config）：扩展层无请求上下文（userId/ip），
// 人工关键操作的审计仍以显式调用为准，扩展层是兜底全量记录。
const baseClient = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
})

export const prisma = globalForPrisma.prisma ?? withDataFoundation(baseClient)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
