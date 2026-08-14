import { generateObject } from 'ai'
import { z } from 'zod'
import { createModel } from '../../../config/model-provider.js'
import { agentMemory } from '../../core/agent-memory.js'
import { skillRegistry } from '../index.js'
import { getComponentLogger } from '../../../infra/logger.js'
import type { SkillContext } from '../skill-types.js'

const logger = getComponentLogger('customer-enroll')

/** 一条推荐候选（来自上一轮 territory_search 的抽取结果） */
export interface RecommendCandidate {
  name: string
  industry?: string
  reason?: string
}

const CandidateListSchema = z.object({
  candidates: z
    .array(
      z.object({
        name: z.string(),
        industry: z.string().optional(),
        reason: z.string().optional(),
      }),
    )
    .max(20),
})

/**
 * 从推荐回复文本中抽取「被推荐为目标客户」的名单。
 * 用 generateObject 保证结构化（范式同 jobs/queue.ts 的 lead_assessment）。
 * 失败返回空数组，不阻断主流程。
 */
export async function extractRecommendedCandidates(
  assistantText: string,
): Promise<RecommendCandidate[]> {
  if (!assistantText || assistantText.trim().length === 0) return []
  try {
    const { object } = await generateObject({
      model: createModel() as never,
      schema: CandidateListSchema,
      system:
        '你是信息抽取助手。从销售助手的目标客户推荐文本中，提取「被推荐为目标客户」的公司/学校名单。' +
        '只提取明确作为推荐对象出现的名称（通常出现在编号列表/表格/结论里），' +
        '不要包含背景说明、现有客户、竞品、纯地区名。若没有明确的推荐目标，返回空数组 candidates:[]。',
      prompt: assistantText.slice(0, 6000),
    })
    return object.candidates.filter((c) => c.name && c.name.trim().length > 0)
  } catch (err) {
    logger.warn({ err: err as Error }, 'extractRecommendedCandidates failed')
    return []
  }
}

/** 中文/阿拉伯数字 → number（仅处理 1~99 常用范围） */
function parseZhNumber(s: string): number | null {
  const digit = parseInt(s, 10)
  if (!Number.isNaN(digit)) return digit
  const map: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  }
  if (s === '十') return 10
  if (s.startsWith('十') && s.length === 2) return 10 + (map[s[1]] ?? 0)
  if (s.endsWith('十') && s.length === 2) return (map[s[0]] ?? 0) * 10
  if (s.length === 3 && s[1] === '十') return (map[s[0]] ?? 0) * 10 + (map[s[2]] ?? 0)
  return map[s] ?? null
}

export interface EnrollTarget {
  name: string
  industry?: string
  reason?: string
  /** recommend = 来自上一轮推荐；name = 用户本轮直接给出的名字 */
  origin: 'recommend' | 'name'
}

/**
 * 解析用户入库指令 → 要入库的目标列表。
 * 支持：序号(第N个/条)、全部(都/这些)、名称匹配(引号/书名号/"把XXX入库")。
 */
export function resolveEnrollTargets(
  userMessage: string,
  candidates: RecommendCandidate[],
): { targets: EnrollTarget[]; reason?: string } {
  const msg = userMessage.trim()

  // 1. 序号：第N个 / 第N条 / 第N家 / 第N所 / 第N校 / 第N院 / 第N位 / 第N名
  const ordMatch = msg.match(/第\s*([一二三四五六七八九十\d]+)\s*[个条名家位所校院]/)
  if (ordMatch) {
    const n = parseZhNumber(ordMatch[1])
    if (n && n >= 1 && n <= candidates.length) {
      return { targets: [{ ...candidates[n - 1], origin: 'recommend' }] }
    }
    return {
      targets: [],
      reason: `未找到第 ${n ?? ordMatch[1]} 个（上一轮共推荐 ${candidates.length} 个）`,
    }
  }

  // 2. 全部
  if (/全部|都入库|都加|都建|这些|这几个|这\s*几/.test(msg)) {
    if (candidates.length === 0) return { targets: [], reason: 'no-candidates' }
    return { targets: candidates.map((c) => ({ ...c, origin: 'recommend' as const })) }
  }

  // 3. 名称：引号/书名号里的，或"把XXX入库"里的 XXX
  //    注意：形如"第二家"这种明显是序号的短语，不应被当客户名直接建库
  const nameHits: string[] = []
  const ordinalLike = /^第\s*[一二三四五六七八九十\d]+\s*[个条名家位所校院]?$/
  const quoted = msg.match(/[「"'《【]([^」"'》】]{2,30})[」"'》】]/g)
  if (quoted) {
    for (const q of quoted) {
      const inner = q.replace(/[「"'《【」"'》】]/g, '').trim()
      if (inner && !nameHits.includes(inner) && !ordinalLike.test(inner)) nameHits.push(inner)
    }
  }
  const ba = msg.match(/把\s*([一-龥A-Za-z0-9·]{2,30}?)(?:公司|学校|学院|大学|客户|机构)?\s*(?:入库|入公海|建档|加进)/)
  if (ba?.[1]) {
    const n = ba[1].trim()
    if (!nameHits.includes(n) && !ordinalLike.test(n)) nameHits.push(n)
  }

  if (nameHits.length > 0) {
    const targets: EnrollTarget[] = []
    for (const hit of nameHits) {
      const matched = candidates.find((c) => c.name.includes(hit) || hit.includes(c.name))
      targets.push(matched ? { ...matched, origin: 'recommend' } : { name: hit, origin: 'name' })
    }
    return { targets }
  }

  // 4. 识别不出
  if (candidates.length === 0) return { targets: [], reason: 'no-candidates' }
  return { targets: [], reason: 'unclear' }
}

const CANDIDATE_KEY = 'recommended-candidates'

interface StoredCandidates {
  candidates: RecommendCandidate[]
  savedAt: string
}

/**
 * 入库编排：读上一轮推荐 → 解析指令 → 逐个调 lead-action → 返回中文摘要（注入 system prompt）。
 * 无候选/识别失败时给出引导提示，不抛错。
 */
export async function handleCustomerEnroll(args: {
  userMessage: string
  sessionId: string
  skillContext: SkillContext
}): Promise<string> {
  const { userMessage, sessionId, skillContext } = args
  const stored = await agentMemory.getJSON<StoredCandidates>(sessionId, CANDIDATE_KEY)
  const candidates = stored?.candidates ?? []

  const { targets, reason } = resolveEnrollTargets(userMessage, candidates)

  if (targets.length === 0) {
    if (reason === 'no-candidates') {
      return '本轮暂无可入库的目标客户。请先让我「推荐目标客户」，或直接给出客户名（如"把XX公司入库"）。'
    }
    return '未识别出要入库的客户。可以这样表达："把第2个入库"、"全部入库"，或"把XX公司入库"。'
  }

  const created: string[] = []
  const skipped: string[] = []
  for (const t of targets) {
    try {
      const res = await skillRegistry.execute(
        'lead-action',
        {
          name: t.name,
          industry: t.industry,
          notes: t.reason ? `由小销推荐：${t.reason}` : '由小销推荐入库',
        },
        skillContext,
      )
      if (res.success) created.push(t.name)
      else skipped.push(`${t.name}（${res.error?.message ?? '失败'}）`)
    } catch (e) {
      skipped.push(`${t.name}（${(e as Error).message}）`)
    }
  }

  const parts: string[] = []
  if (created.length > 0) {
    parts.push(`已创建目标客户：${created.join('、')}（已落入公海池，可信度中，待销售核实）`)
  }
  if (skipped.length > 0) {
    parts.push(`未成功：${skipped.join('、')}`)
  }
  return parts.join('；')
}
