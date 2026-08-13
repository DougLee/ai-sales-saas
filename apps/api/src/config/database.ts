import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
})

// V3.1 操作审计：暂时不挂 Prisma middleware（Prisma 6.x 兼容性暂未解决）
// 当前由 controller 显式调 logAudit() 记录关键操作（auth / AI config）
// V3.2 再做 Prisma Client Extensions 全量自动捕获

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
