import 'dotenv/config'
import fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { env } from './config/env.js'
import { logger } from './infra/logger.js'
import { errorHandler } from './infra/error-handler.js'
import { performHealthCheck } from './infra/health-check.js'
import { tenantContextPlugin } from './tenant/tenant-context.js'
import { authPlugin } from './plugins/auth.plugin.js'
import { registerGlobalRateLimit, registerAgentRateLimit } from './plugins/rate-limit.plugin.js'
import { authRoutes } from './auth/auth.routes.js'
import { methodologyRoutes } from './methodology/methodology.routes.js'
import { leadsRoutes } from './crm/leads/leads.routes.js'
import { projectsRoutes } from './crm/projects/projects.routes.js'
import { visitsRoutes } from './crm/visits/visits.routes.js'
import { confirmationsRoutes } from './crm/confirmations/confirmations.routes.js'
import { spotCheckRoutes } from './crm/spotcheck/spot-check.routes.js'
import { companiesRoutes } from './crm/companies/companies.routes.js'
import { contactsRoutes } from './crm/contacts/contacts.routes.js'
import { tasksRoutes } from './crm/tasks/tasks.routes.js'
import { chatRoutes } from './agents/chat.routes.js'
import { alertRoutes } from './agents/workflows/alert.routes.js'
import { companionRoutes } from './agents/workflows/companion.routes.js'
import { kbRoutes } from './knowledge-base/kb.routes.js'
import { dashboardRoutes } from './dashboard/dashboard.routes.js'
import { dataQualityRoutes } from './crm/data-quality/data-quality.routes.js'
import { aiConfigRoutes } from './config/ai-config.routes.js'
import { usersRoutes } from './org/users/users.routes.js'
import { startWorkers, startCompanionSnapshotWorker, startCompanionBriefingWorker, startVisitPreparationWorker, startAudioCleanupWorker, scheduleAudioCleanup } from './jobs/queue.js'
import { jobsRoutes } from './jobs/jobs.routes.js'
import { scheduleCompanionCron } from './jobs/cronCompanion.js'
import { getPackageVersion } from './lib/version.js'

const app = fastify({
  loggerInstance: logger.child({ component: 'http' }),
})

const API_VERSION = getPackageVersion()

// Global error handler
app.setErrorHandler(errorHandler)

// Plugins
await app.register(cors, { origin: true, credentials: true })
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })
await app.register(jwt, { secret: env.JWT_SECRET })
await app.register(swagger, {
  openapi: {
    info: { title: 'AI Sales API', version: API_VERSION },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
})
await app.register(swaggerUi, { routePrefix: '/docs' })
await app.register(authPlugin)
await app.register(tenantContextPlugin)
await app.register(registerGlobalRateLimit)

// Routes
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(methodologyRoutes, { prefix: '/api/methodology-config' })
await app.register(leadsRoutes, { prefix: '/api/leads' })
await app.register(projectsRoutes, { prefix: '/api/projects' })
await app.register(visitsRoutes, { prefix: '/api/visits' })
await app.register(confirmationsRoutes, { prefix: '/api/confirmations' })
await app.register(spotCheckRoutes, { prefix: '/api/spot-check' })
await app.register(companiesRoutes, { prefix: '/api/companies' })
await app.register(contactsRoutes, { prefix: '/api/contacts' })
await app.register(tasksRoutes, { prefix: '/api/tasks' })
await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
await app.register(dataQualityRoutes, { prefix: '/api/data-quality' })
await app.register(registerAgentRateLimit, { prefix: '/api/agent' })
await app.register(chatRoutes, { prefix: '/api/agent/chat' })
await app.register(alertRoutes, { prefix: '/api/alerts' })
await app.register(companionRoutes, { prefix: '/api/companion' })
await app.register(jobsRoutes, { prefix: '/api/jobs' })
await app.register(kbRoutes, { prefix: '/api/knowledge-base' })
await app.register(usersRoutes, { prefix: '/api/users' })
await app.register(aiConfigRoutes)

// Health check
app.get('/health', async (_req, reply) => {
  const result = await performHealthCheck()
  const statusCode = result.status === 'ok' ? 200 : 503
  reply.code(statusCode).send(result)
})

// Start background workers
startWorkers()
startCompanionSnapshotWorker()
startCompanionBriefingWorker()
startVisitPreparationWorker()
startAudioCleanupWorker()

// 给默认租户注册 cron（生产由运维调用 register-cron 接口对所有 tenant 注册）
scheduleCompanionCron('default', 'system').catch((err) =>
  app.log.error({ err }, 'Failed to register default tenant companion cron'),
)
scheduleAudioCleanup('default').catch((err) =>
  app.log.error({ err }, 'Failed to register default tenant audio cleanup cron'),
)

// Start server
try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  app.log.info(`Server listening on http://localhost:${env.PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
