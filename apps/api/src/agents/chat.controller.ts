import { loadAllExperts } from './experts/registry.js'
import { logger } from '../infra/logger.js'
import { skillRegistry } from './skills/index.js'
import { webSearchSkill } from './skills/search/web-search.skill.js'
import { projectQuerySkill } from './skills/crm/project-query.skill.js'
import { companyQuerySkill } from './skills/crm/company-query.skill.js'
import { leadQuerySkill } from './skills/crm/lead-query.skill.js'
import { customerAggregateSkill } from './skills/crm/customer-aggregate.skill.js'
import { visitActionSkill } from './skills/crm/visit-action.skill.js'
import { taskActionSkill } from './skills/crm/task-action.skill.js'
import { leadActionSkill } from './skills/crm/lead-action.skill.js'
import { kbSearchSkill } from './skills/kb/kb-search.skill.js'
import { projectAnalysisSkill } from './skills/analysis/project-analysis.skill.js'
import { briefingQuerySkill } from './skills/query/briefing-query.skill.js'
import { proactiveRecommendationsSkill } from './skills/crm/proactive-recommendations.skill.js'
import { visitQuerySkill } from './skills/visit/visit-query.skill.js'
import { visitAnalysisSkill } from './skills/visit/visit-analysis.skill.js'

// 注册所有 Skills
skillRegistry.register(webSearchSkill)
skillRegistry.register(projectQuerySkill)
skillRegistry.register(companyQuerySkill)
skillRegistry.register(leadQuerySkill)
skillRegistry.register(customerAggregateSkill)
skillRegistry.register(visitActionSkill)
skillRegistry.register(taskActionSkill)
skillRegistry.register(leadActionSkill)
skillRegistry.register(kbSearchSkill)
skillRegistry.register(projectAnalysisSkill)
skillRegistry.register(briefingQuerySkill)
skillRegistry.register(proactiveRecommendationsSkill)
skillRegistry.register(visitQuerySkill)
skillRegistry.register(visitAnalysisSkill)

// 延迟加载 Expert 模块（避免阻塞启动）
loadAllExperts().catch((e) => logger.error({ err: e }, 'Failed to load experts'))

export { chat } from './chat.handler.js'
export { audit } from './audit.handler.js'
export { listSessions, getSessionMessages, deleteSession } from './session.handler.js'
