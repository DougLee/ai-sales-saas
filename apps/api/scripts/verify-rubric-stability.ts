/**
 * 一次性验证脚本：rubric 重复评分稳定性（V6.1 §十一：同一拜访分差 ≤10）
 * 用法: npx tsx scripts/verify-rubric-stability.ts <visitId> <userId>
 */
import { PrismaClient } from '@prisma/client'
import { scoreVisitWithRubric } from '../src/crm/visits/rubric.service.js'

const [visitId, userId] = process.argv.slice(2)
if (!visitId) {
  console.error('usage: npx tsx scripts/verify-rubric-stability.ts <visitId> [userId]')
  process.exit(1)
}

const prisma = new PrismaClient()

// ownerId 直接从闭环记录取，避免手传
const closure = await prisma.visitClosure.findUnique({ where: { visitId } })
if (!closure) {
  console.error('closure not found for visit', visitId)
  process.exit(1)
}
const ownerId = userId || closure.ownerId

const s1 = await scoreVisitWithRubric(prisma as never, { visitId, userId: ownerId })
const s2 = await scoreVisitWithRubric(prisma as never, { visitId, userId: ownerId })

console.log(`score1=${s1} score2=${s2} diff=${s1 != null && s2 != null ? Math.abs(s1 - s2) : 'n/a'}`)
console.log(s1 != null && s2 != null && Math.abs(s1 - s2) <= 10 ? 'PASS: 分差 ≤10' : 'FAIL')

await prisma.$disconnect()
