import type { IntentResult } from './agent-types.js'

export interface SkillCallRequest {
  skillId: string
  params: Record<string, unknown>
  reason: string
}

export interface SkillRouterContext {
  page?: string
  entityType?: string
  entityId?: string
}

/**
 * 根据意图和页面上下文，决定需要调用哪些 Skill 来获取数据/执行业务
 *
 * 设计原则：
 * 1. 明确意图直接映射到 Skill，不依赖 LLM 自行选择
 * 2. 如果存在 entityId，优先使用具体实体查询 Skill
 * 3. 多个 Skill 可以并行执行
 */
export function resolveSkills(
  intent: IntentResult,
  ctx?: SkillRouterContext,
): SkillCallRequest[] {
  const calls: SkillCallRequest[] = []
  const intentName = intent.intent
  const entityType = ctx?.entityType
  const entityId = ctx?.entityId

  // 如果有明确实体上下文，优先查询该实体详情
  if (entityType === 'project' && entityId) {
    calls.push({
      skillId: 'project-query',
      params: { action: 'detail', projectId: entityId },
      reason: '用户正在查看该商机，需要基于完整信息回答',
    })
  } else if (entityType === 'lead' && entityId) {
    calls.push({
      skillId: 'lead-query',
      params: { keyword: entityId },
      reason: '用户正在查看该线索',
    })
  } else if (entityType === 'customer' && entityId) {
    calls.push({
      skillId: 'customer-aggregate',
      params: { customerId: entityId },
      reason: '用户正在查看该客户，需要聚合客户全景数据',
    })
  }

  // 按意图补充其他 Skill
  switch (intentName) {
    case 'background_research':
      calls.push(
        { skillId: 'web-search', params: { query: buildSearchQuery(intent) }, reason: '需要补充公开网络信息' },
        { skillId: 'company-query', params: { action: 'searchCompanies', keyword: intent.parameters?.targetName as string }, reason: '查询 CRM 中是否已有该客户' },
        { skillId: 'kb-search', params: { action: 'semanticSearch', query: buildSearchQuery(intent) }, reason: '查询知识库中相关案例和方法论' },
      )
      break

    case 'territory_search':
    case 'territory_expansion':
      calls.push(
        { skillId: 'web-search', params: { query: buildSearchQuery(intent) }, reason: '检索区域客户/市场信息' },
        { skillId: 'company-query', params: { action: 'searchCompanies', keyword: intent.parameters?.region as string }, reason: '查询 CRM 中该区域已有客户' },
        { skillId: 'kb-search', params: { action: 'semanticSearch', query: buildSearchQuery(intent) }, reason: '查询知识库中区域开拓案例' },
      )
      break

    case 'visit_preparation': {
      if (entityType === 'customer' && entityId) {
        calls.push({ skillId: 'customer-aggregate', params: { customerId: entityId }, reason: '准备拜访需要了解客户全景' })
      } else {
        const ref = projectRef(intent, ctx)
        if (ref) {
          calls.push({ skillId: 'project-query', params: { action: 'detail', ...ref }, reason: '准备拜访需要了解项目全貌' })
        }
        if (intent.parameters?.targetName) {
          calls.push({ skillId: 'company-query', params: { action: 'searchContacts', keyword: intent.parameters?.targetName as string }, reason: '查找联系人信息' })
        }
      }
      calls.push(
        { skillId: 'visit-query', params: { action: 'search', projectId: entityId }, reason: '查看近期拜访记录' },
        { skillId: 'kb-search', params: { action: 'semanticSearch', query: '拜访准备 话术 SPIN' }, reason: '查询拜访准备方法论' },
      )
      break
    }

    case 'visit_analysis': {
      const visitId =
        entityType === 'visit'
          ? entityId
          : (intent.parameters?.visitId as string | undefined)
      if (visitId) {
        calls.push({
          skillId: 'visit-analysis',
          params: { visitId },
          reason: '分析具体拜访内容，提取决策链、里程碑进展、风险点',
        })
      } else {
        calls.push({
          skillId: 'visit-query',
          params: { action: 'search', projectId: entityId },
          reason: '查找近期拜访记录',
        })
      }
      if (entityType === 'customer' && entityId) {
        calls.push({ skillId: 'customer-aggregate', params: { customerId: entityId }, reason: '复盘需要基于客户全景' })
      } else {
        const ref = projectRef(intent, ctx)
        if (ref) {
          calls.push(
            { skillId: 'project-query', params: { action: 'detail', ...ref }, reason: '复盘需要基于项目状态' },
            { skillId: 'project-query', params: { action: 'health', ...ref }, reason: '评估里程碑推进情况' },
          )
        }
      }
      calls.push(
        { skillId: 'kb-search', params: { action: 'semanticSearch', query: '拜访复盘 SPIN 分析' }, reason: '查询拜访复盘方法论' },
      )
      break
    }

    case 'demand_mining':
    case 'follow_up': {
      if (entityType === 'customer' && entityId) {
        calls.push({ skillId: 'customer-aggregate', params: { customerId: entityId }, reason: '跟进/需求挖掘基于客户全景' })
      } else {
        const ref = projectRef(intent, ctx)
        if (ref) {
          calls.push(
            { skillId: 'project-query', params: { action: 'detail', ...ref }, reason: '跟进/需求挖掘基于项目状态' },
            { skillId: 'project-query', params: { action: 'health', ...ref }, reason: '了解项目健康度' },
          )
        }
      }
      calls.push(
        { skillId: 'kb-search', params: { action: 'semanticSearch', query: '需求挖掘 跟进策略' }, reason: '查询需求挖掘方法论' },
      )
      break
    }

    case 'project_health': {
      if (entityType === 'customer' && entityId) {
        calls.push({ skillId: 'customer-aggregate', params: { customerId: entityId }, reason: '健康诊断基于客户全景' })
        break
      }
      const ref = projectRef(intent, ctx)
      if (ref) {
        calls.push(
          { skillId: 'project-query', params: { action: 'detail', ...ref }, reason: '获取商机全貌作为诊断依据' },
          { skillId: 'project-query', params: { action: 'health', ...ref }, reason: '五维健康雷达是评分诊断的核心数据' },
        )
        if ('projectId' in ref) {
          calls.push({ skillId: 'visit-query', params: { action: 'search', projectId: ref.projectId }, reason: '近期拜访记录佐证拜访频率维度' })
        }
      } else {
        calls.push({ skillId: 'project-query', params: { action: 'search' }, reason: '未指定具体商机，给出项目全景概览' })
      }
      break
    }

    case 'lead_assessment':
      calls.push(
        { skillId: 'lead-query', params: { keyword: intent.parameters?.targetName as string }, reason: '评估线索价值' },
        { skillId: 'kb-search', params: { action: 'semanticSearch', query: '线索评估 分级标准' }, reason: '查询线索评估方法论' },
      )
      break

    case 'team_management':
      calls.push(
        { skillId: 'proactive-recommendations', params: {}, reason: '团队管理需要每日推荐行动' },
        { skillId: 'briefing-query', params: {}, reason: '团队管理需要今日简报' },
        { skillId: 'project-query', params: { action: 'search' }, reason: '团队管理需要项目全景' },
      )
      break

    case 'illusion_detection': {
      const ref = projectRef(intent, ctx)
      if (ref) {
        calls.push({ skillId: 'project-query', params: { action: 'health', ...ref }, reason: '风险识别基于健康度分析' })
      }
      calls.push(
        { skillId: 'kb-search', params: { action: 'semanticSearch', query: '项目风险识别 假项目信号' }, reason: '查询风险识别方法论' },
      )
      break
    }

    case 'bidding_monitor':
      calls.push(
        { skillId: 'web-search', params: { query: buildSearchQuery(intent) }, reason: '招投标信息需要网络检索' },
      )
      break

    case 'sales_coaching':
      calls.push(
        { skillId: 'kb-search', params: { action: 'semanticSearch', query: '销售辅导 技巧 话术' }, reason: '查询销售辅导方法论' },
      )
      break
    default:
      // 这些意图不强制调用 Skill，让 LLM 基于已有知识回答
      break
  }

  // 去重：同一 skill + 同一 params 只保留一次
  const seen = new Set<string>()
  return calls.filter((call) => {
    const key = `${call.skillId}:${JSON.stringify(call.params)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildSearchQuery(intent: IntentResult): string {
  const params = intent.parameters || {}
  const parts: string[] = []
  if (params.targetName) parts.push(String(params.targetName))
  if (params.region) parts.push(String(params.region))
  if (params.product) parts.push(String(params.product))
  if (params.scene) parts.push(String(params.scene))
  return parts.length > 0 ? parts.join(' ') : '销售 客户 市场'
}

/**
 * 商机实体解析：优先页面上下文 entityId，否则用意图提取的 targetName 走关键词解析。
 * 返回 null 表示无法定位具体商机（调用方应跳过 detail/health 或降级为列表查询）。
 */
function projectRef(
  intent: IntentResult,
  ctx?: SkillRouterContext,
): { projectId: string } | { keyword: string } | null {
  if (ctx?.entityType === 'project' && ctx?.entityId) return { projectId: ctx.entityId }
  const targetName = intent.parameters?.targetName as string | undefined
  if (targetName) return { keyword: targetName }
  return null
}
