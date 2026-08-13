export * from './skill-types.js'
export { SkillRegistry, skillRegistry } from './skill-registry.js'

// Search skills
export { webSearchSkill } from './search/web-search.skill.js'

// CRM skills
export { projectQuerySkill } from './crm/project-query.skill.js'
export { companyQuerySkill } from './crm/company-query.skill.js'
export { leadQuerySkill } from './crm/lead-query.skill.js'
export { customerAggregateSkill } from './crm/customer-aggregate.skill.js'
export { visitActionSkill } from './crm/visit-action.skill.js'
export { taskActionSkill } from './crm/task-action.skill.js'
export { leadActionSkill } from './crm/lead-action.skill.js'

// KB skills
export { kbSearchSkill } from './kb/kb-search.skill.js'

// Analysis skills
export { projectAnalysisSkill } from './analysis/project-analysis.skill.js'

// Query skills
export { briefingQuerySkill } from './query/briefing-query.skill.js'
export { proactiveRecommendationsSkill } from './crm/proactive-recommendations.skill.js'

// Visit skills
export { visitQuerySkill } from './visit/visit-query.skill.js'
export { visitAnalysisSkill } from './visit/visit-analysis.skill.js'
