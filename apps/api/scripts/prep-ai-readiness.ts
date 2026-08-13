/**
 * 一次性验证脚本：为 E2E 项目补齐 humanInfo.firstContact（让阶段门槛放行），
 * 以便验证里程碑推进后的 AI Readiness Check 通路。
 * 用法: npx tsx scripts/prep-ai-readiness.ts <projectId>
 */
import { PrismaClient } from '@prisma/client'

const projectId = process.argv[2]
if (!projectId) {
  console.error('usage: npx tsx scripts/prep-ai-readiness.ts <projectId>')
  process.exit(1)
}

const prisma = new PrismaClient()

const project = await prisma.project.findUnique({ where: { id: projectId } })
if (!project) {
  console.error('project not found')
  process.exit(1)
}

const humanInfo = { ...((project.humanInfo as Record<string, unknown>) || {}), firstContact: 'cold_call' }
await prisma.project.update({ where: { id: projectId }, data: { humanInfo: humanInfo as never } })
console.log(`humanInfo.firstContact=cold_call set on project ${projectId} (milestone=${project.milestone})`)

await prisma.$disconnect()
