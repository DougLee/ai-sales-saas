import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function setup() {
  // 验证数据库连接
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (err) {
    console.warn('[integration] Database not available, skipping integration tests')
    process.exit(0)
  }
}

export async function teardown() {
  await prisma.$disconnect()
}
