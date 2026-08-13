const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
;(async () => {
  try {
    const r = await prisma.behaviorLog.upsert({
      where: {
        unique_visit_closure_log: {
          tenantId: 't-debug',
          userId: 'u-debug',
          visitId: 'v-debug',
          type: 'visit_closure',
        },
      },
      create: { tenantId: 't-debug', userId: 'u-debug', type: 'visit_closure', visitId: 'v-debug', score: 1 },
      update: { score: 2 },
    })
    console.log('OK', r.id)
    await prisma.behaviorLog.delete({ where: { id: r.id } })
  } catch (e) {
    console.log('FAIL:', e.message.split('\n').slice(-3).join(' | '))
  }
  await prisma.$disconnect()
})()
