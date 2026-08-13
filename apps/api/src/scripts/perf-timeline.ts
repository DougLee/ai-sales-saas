// Task 7 性能抽查：单客户 90 天时间轴查询（1000 条事件量级）目标 < 500ms
// 用法: pnpm exec tsx src/scripts/perf-timeline.ts
import { PrismaClient } from '@prisma/client'
import { getTimeline } from '../lib/timeline.js'

const prisma = new PrismaClient()

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow()
  const company = await prisma.company.findFirstOrThrow({ where: { tenantId: tenant.id } })

  // 幂等：清掉旧的 perf 数据再插
  const deleted = await prisma.timelineEvent.deleteMany({
    where: { tenantId: tenant.id, sourceType: 'perf-test' },
  })
  if (deleted.count) console.log(`清理旧 perf 数据 ${deleted.count} 条`)

  const now = Date.now()
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    tenantId: tenant.id,
    customerId: company.id,
    customerType: 'company',
    eventType: i % 10 === 0 ? 'visit.completed' : 'note.added',
    eventData: { seq: i, text: 'x'.repeat(200) },
    factStatus: i % 7 === 0 ? 'pending_confirmation' : 'confirmed',
    sourceType: 'perf-test',
    // 均匀分布在最近 90 天
    eventTime: new Date(now - Math.floor((i / 1000) * 90 * 86400000)),
  }))
  await prisma.timelineEvent.createMany({ data: rows })
  console.log('已插入 1000 条测试事件（最近 90 天，1/7 为 pending）')

  const start90 = new Date(now - 90 * 86400000)
  // 预热一次再测 3 次
  await getTimeline(prisma, { tenantId: tenant.id, customerId: company.id, startTime: start90, limit: 50 })
  const times: number[] = []
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    const r = await getTimeline(prisma, {
      tenantId: tenant.id,
      customerId: company.id,
      startTime: start90,
      limit: 50,
    })
    times.push(performance.now() - t0)
    if (i === 0) console.log(`confirmed 总数=${r.total}, 首页=${r.items.length}`)
  }
  console.log(`查询耗时(ms): ${times.map((t) => t.toFixed(1)).join(', ')}`)
  const max = Math.max(...times)
  console.log(max < 500 ? `✅ 达标（最差 ${max.toFixed(1)}ms < 500ms）` : `❌ 超标（最差 ${max.toFixed(1)}ms）`)
}

main().finally(() => prisma.$disconnect())
