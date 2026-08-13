import type { ExpertAgent } from './types.js'
import { logger } from '../../infra/logger.js'

const registry = new Map<string, ExpertAgent>()

export function registerExpert(expert: ExpertAgent) {
  if (registry.has(expert.intent)) {
    throw new Error(`Expert already registered for intent: ${expert.intent}`)
  }
  registry.set(expert.intent, expert)
}

export function findExpert(intent: string): ExpertAgent | undefined {
  return registry.get(intent)
}

export function listExperts(): ExpertAgent[] {
  return Array.from(registry.values())
}

// 延迟加载所有 Expert 模块，避免循环依赖
export async function loadAllExperts() {
  if (registry.size > 0) return

  const moduleImports = [
    { name: 'visit-prep', promise: import('./visit-prep.js') },
    { name: 'visit-analysis', promise: import('./visit-analysis.js') },
    { name: 'background-research', promise: import('./background-research.js') },
    { name: 'bidding-monitor', promise: import('./bidding-monitor.js') },
    { name: 'lead-assessment', promise: import('./lead-assessment.js') },
    { name: 'team-management', promise: import('./team-management.js') },
    { name: 'territory-search', promise: import('./territory-search.js') },
    { name: 'illusion-detection', promise: import('./illusion-detection.js') },
    { name: 'demand-mining', promise: import('./demand-mining.js') },
    { name: 'follow-up', promise: import('./follow-up.js') },
    { name: 'sales-coaching', promise: import('./sales-coaching.js') },
    { name: 'territory-expansion', promise: import('./territory-expansion.js') },
  ]

  const modules = await Promise.all(
    moduleImports.map(({ name, promise }) =>
      promise.catch((err) => {
        logger.error({ err, moduleName: name }, 'Failed to load expert module')
        return null
      }),
    ),
  )

  let loaded = 0
  for (const mod of modules) {
    if (mod && typeof mod.register === 'function') {
      mod.register()
      loaded++
    }
  }

  logger.info({ loaded }, 'Expert modules loaded')
}
