/**
 * V6.1 Phase 1 — 历史数据回填脚本
 *
 * 将存量 项目/拜访/里程碑历史 批量转为 TimelineEvent：
 *   Project            → project.created
 *   Project.milestoneHistory → milestone.advanced（逐条）
 *   Visit              → visit.completed
 *   Visit（含 aiAnalysis）→ visit.analyzed
 *
 * 特性：
 * - 全部回填事件 sourceType='system', sourceId='backfill:<原表名>:<原记录ID>', factStatus='confirmed'
 * - 幂等：以 sourceId 去重，可安全重复执行
 * - dry-run：`--dry` 只输出统计，不写库
 *
 * 运行：pnpm exec tsx src/scripts/backfill-timeline.ts [--dry]
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry')

interface Stats {
  projectCreated: number
  milestoneAdvanced: number
  visitCompleted: number
  visitAnalyzed: number
  skippedExisting: number
  errors: number
}

async function existsBackfill(sourceId: string): Promise<boolean> {
  const n = await prisma.timelineEvent.count({
    where: { sourceType: 'system', sourceId },
  })
  return n > 0
}

async function writeEvent(data: {
  tenantId: string
  ownerId?: string | null
  orgId?: string | null
  customerId: string
  projectId?: string | null
  eventType: string
  eventData: Record<string, unknown>
  aiInsight?: string | null
  sourceId: string
  sourceLabel: string
  eventTime: Date
}) {
  if (DRY_RUN) return
  await prisma.timelineEvent.create({
    data: {
      tenantId: data.tenantId,
      ownerId: data.ownerId ?? undefined,
      orgId: data.orgId ?? undefined,
      customerId: data.customerId,
      customerType: 'company',
      projectId: data.projectId ?? undefined,
      eventType: data.eventType,
      eventData: data.eventData as never,
      aiInsight: data.aiInsight ?? undefined,
      factStatus: 'confirmed', // 历史数据视为已确认事实
      sourceType: 'system',
      sourceId: data.sourceId,
      sourceLabel: data.sourceLabel,
      eventTime: data.eventTime,
    },
  })
}

async function main() {
  const stats: Stats = {
    projectCreated: 0,
    milestoneAdvanced: 0,
    visitCompleted: 0,
    visitAnalyzed: 0,
    skippedExisting: 0,
    errors: 0,
  }

  console.log(DRY_RUN ? '🔍 DRY-RUN 模式：只统计，不写库\n' : '🚀 开始回填历史数据...\n')

  // ============ 1. 项目 → project.created + milestone.advanced ============
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: {
      id: true, tenantId: true, ownerId: true, orgId: true, companyId: true,
      name: true, milestone: true, milestoneHistory: true, createdAt: true,
    },
  })
  console.log(`发现 ${projects.length} 个项目`)

  for (const p of projects) {
    if (!p.companyId) continue // 无客户关联的项目跳过（时间轴要求 customerId）
    const sid = `backfill:project:${p.id}`
    try {
      if (await existsBackfill(sid)) {
        stats.skippedExisting++
      } else {
        await writeEvent({
          tenantId: p.tenantId,
          ownerId: p.ownerId,
          orgId: p.orgId,
          customerId: p.companyId,
          projectId: p.id,
          eventType: 'project.created',
          eventData: { name: p.name, backfilled: true },
          sourceId: sid,
          sourceLabel: '历史数据回填',
          eventTime: p.createdAt,
        })
        stats.projectCreated++
      }

      // 里程碑历史 → milestone.advanced
      const history = (p.milestoneHistory as Array<Record<string, unknown>>) || []
      for (let i = 0; i < history.length; i++) {
        const h = history[i]
        const msid = `backfill:milestone:${p.id}:${i}`
        if (await existsBackfill(msid)) {
          stats.skippedExisting++
          continue
        }
        await writeEvent({
          tenantId: p.tenantId,
          ownerId: p.ownerId,
          orgId: p.orgId,
          customerId: p.companyId,
          projectId: p.id,
          eventType: 'milestone.advanced',
          eventData: {
            from_milestone: h.from ?? h.fromMilestone ?? null,
            to_milestone: h.to ?? h.toMilestone ?? h.milestone ?? null,
            triggered_by: 'user',
            reason: (h.reason as string) || '历史回填',
            backfilled: true,
          },
          sourceId: msid,
          sourceLabel: '历史数据回填',
          eventTime: h.at ? new Date(h.at as string) : p.createdAt,
        })
        stats.milestoneAdvanced++
      }
    } catch (err) {
      stats.errors++
      console.error(`  ❌ 项目 ${p.id} 回填失败:`, (err as Error).message)
    }
  }

  // ============ 2. 拜访 → visit.completed + visit.analyzed ============
  const visits = await prisma.visit.findMany({
    select: {
      id: true, tenantId: true, ownerId: true, orgId: true,
      companyId: true, projectId: true, visitTime: true, visitType: true,
      summary: true, aiAnalysis: true, createdAt: true,
    },
  })
  console.log(`发现 ${visits.length} 次拜访`)

  for (const v of visits) {
    if (!v.companyId) continue
    const cid = v.companyId
    const sid = `backfill:visit:${v.id}`
    try {
      if (await existsBackfill(sid)) {
        stats.skippedExisting++
      } else {
        await writeEvent({
          tenantId: v.tenantId,
          ownerId: v.ownerId,
          orgId: v.orgId,
          customerId: cid,
          projectId: v.projectId,
          eventType: 'visit.completed',
          eventData: {
            visitId: v.id,
            visitType: v.visitType,
            summary: (v.summary || '').slice(0, 200),
            backfilled: true,
          },
          sourceId: sid,
          sourceLabel: '历史数据回填',
          eventTime: v.visitTime,
        })
        stats.visitCompleted++
      }

      // 有 AI 分析的拜访 → visit.analyzed（历史数据视为已确认）
      const hasAnalysis = v.aiAnalysis && Object.keys(v.aiAnalysis as Record<string, unknown>).length > 0
      if (hasAnalysis) {
        const asid = `backfill:visit-analysis:${v.id}`
        if (await existsBackfill(asid)) {
          stats.skippedExisting++
        } else {
          await writeEvent({
            tenantId: v.tenantId,
            ownerId: v.ownerId,
            orgId: v.orgId,
            customerId: cid,
            projectId: v.projectId,
            eventType: 'visit.analyzed',
            eventData: { visitId: v.id, analysis: v.aiAnalysis, backfilled: true },
            sourceId: asid,
            sourceLabel: '历史数据回填',
            eventTime: v.visitTime,
          })
          stats.visitAnalyzed++
        }
      }
    } catch (err) {
      stats.errors++
      console.error(`  ❌ 拜访 ${v.id} 回填失败:`, (err as Error).message)
    }
  }

  console.log('\n========== 回填统计 ==========')
  console.log(`project.created:     ${stats.projectCreated}`)
  console.log(`milestone.advanced:  ${stats.milestoneAdvanced}`)
  console.log(`visit.completed:     ${stats.visitCompleted}`)
  console.log(`visit.analyzed:      ${stats.visitAnalyzed}`)
  console.log(`跳过（已存在）:      ${stats.skippedExisting}`)
  console.log(`错误:                ${stats.errors}`)
  if (DRY_RUN) console.log('\n⚠️  DRY-RUN：以上事件未写入。去掉 --dry 参数后实跑。')
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
