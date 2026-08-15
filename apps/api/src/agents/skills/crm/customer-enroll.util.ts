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
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
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
 * 垃圾名称守卫：序数/指示代词/动作碎片绝不能当客户名建库。
 * 案例（2026-08-15）："把上边提到的前三个客户入库" 曾把「上边提到的前三个」建成客户。
 */
const JUNK_NAME_RE =
  /(?:第|前|后)\s*[一二两三四五六七八九十\d]+\s*[个条名家位所校位]?$|^上边|^上面|^前面|^刚才|^之前|^上述|^前文|^这家|^那个|提到|自动|全部|这些|几个|[个条家些]$/

function isJunkName(name: string): boolean {
  const n = name.trim()
  if (n.length < 2 || n.length > 30) return true
  return JUNK_NAME_RE.test(n)
}

/**
 * 解析用户入库指令 → 要入库的目标列表。
 * 支持：序号（第N个/前N个/后N个/条/家…）、全部(都/这些)、名称匹配(引号/书名号/"把XXX入库")。
 */
export function resolveEnrollTargets(
  userMessage: string,
  candidates: RecommendCandidate[],
): { targets: EnrollTarget[]; reason?: string } {
  const msg = userMessage.trim()

  // 1. 序号：第N个（第 3 个）/ 前N个（前三个 = 头 3 个）/ 后N个（后两个 = 末 2 个）
  const ordMatch = msg.match(/(第|前|后)\s*([一二两三四五六七八九十\d]+)\s*[个条名家位所校院]/)
  if (ordMatch) {
    const kind = ordMatch[1]
    const n = parseZhNumber(ordMatch[2])
    if (!n || n < 1) {
      return { targets: [], reason: 'unclear' }
    }
    if (kind === '前') {
      if (candidates.length === 0) return { targets: [], reason: 'no-candidates' }
      if (n > candidates.length) {
        return { targets: [], reason: `上一轮只推荐了 ${candidates.length} 个，没有前 ${n} 个` }
      }
      return { targets: candidates.slice(0, n).map((c) => ({ ...c, origin: 'recommend' as const })) }
    }
    if (kind === '后') {
      if (candidates.length === 0) return { targets: [], reason: 'no-candidates' }
      if (n > candidates.length) {
        return { targets: [], reason: `上一轮只推荐了 ${candidates.length} 个，没有后 ${n} 个` }
      }
      return { targets: candidates.slice(-n).map((c) => ({ ...c, origin: 'recommend' as const })) }
    }
    if (n <= candidates.length) {
      return { targets: [{ ...candidates[n - 1], origin: 'recommend' }] }
    }
    return {
      targets: [],
      reason: `未找到第 ${n} 个（上一轮共推荐 ${candidates.length} 个）`,
    }
  }

  // 2. 全部
  if (/全部|都入库|都加|都建|这些|这几个|这\s*几/.test(msg)) {
    if (candidates.length === 0) return { targets: [], reason: 'no-candidates' }
    return { targets: candidates.map((c) => ({ ...c, origin: 'recommend' as const })) }
  }

  // 3. 名称：引号/书名号里的，或"把XXX入库"里的 XXX（过垃圾名称守卫）
  const nameHits: string[] = []
  const quoted = msg.match(/[「"'《【]([^」"'》】]{2,30})[」"'》】]/g)
  if (quoted) {
    for (const q of quoted) {
      const inner = q.replace(/[「"'《【」"'》】]/g, '').trim()
      if (inner && !nameHits.includes(inner) && !isJunkName(inner)) nameHits.push(inner)
    }
  }
  // 名称含机构后缀（公司/大学/学院…）时整体捕获，避免"把开封大学入库"只截到"开封"
  const ba = msg.match(/把\s*([一-龥A-Za-z0-9·]{2,30}?(?:公司|学校|学院|大学|医院|机构)?)\s*(?:入库|入公海|建档|加进)/)
  if (ba?.[1]) {
    const n = ba[1].trim()
    if (!nameHits.includes(n) && !isJunkName(n)) nameHits.push(n)
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

/**
 * P1（#22）：LLM 结构化解析——指代消解主路径，正则降级为守卫/兜底。
 * 铁律：指代只能解析成候选槽位（slot），永远不能解析成自由文本；
 * 解析不动的原文落 unresolved，交上层引导，绝不猜。
 */
const EnrollIntentSchema = z.object({
  action: z.enum(['enroll', 'unknown']),
  refs: z
    .array(
      z.object({
        kind: z.enum(['slot', 'name']),
        slot: z.number().optional(),
        name: z.string().optional(),
      }),
    )
    .max(20),
  unresolved: z.string().optional(),
})

export interface EnrollParseDecision {
  targets: EnrollTarget[]
  reason?: string
  /** 解析引擎（#24 决策日志用） */
  engine: 'llm' | 'regex' | 'llm-fallback-regex'
}

/** LLM 主路径：把用户指令 + 候选清单 + 上一轮助手回复喂给结构化抽取 */
async function extractEnrollIntentLLM(
  userMessage: string,
  candidates: RecommendCandidate[],
  prevAssistantText: string,
): Promise<EnrollParseDecision> {
  const candList = candidates.map((c, i) => `${i + 1}. ${c.name}`).join('\n') || '（无候选）'
  const { object } = await generateObject({
    model: createModel() as never,
    schema: EnrollIntentSchema,
    system:
      '你是销售指令解析器。用户要把目标客户"入库"。候选清单是上一轮推荐过的客户（带序号）。\n' +
      '规则：\n' +
      '- 用户的指代（前三个/第二个/最后一家/上面提到的那几个）必须解析成候选序号 slot，禁止把指代原文当客户名\n' +
      '- 用户明确说出的、候选清单里没有的新客户名，kind=name\n' +
      '- 完全解析不动（既不是指代也不是明确名称）时 action=unknown 并把原文放 unresolved\n' +
      '- 用户只是聊天/提问而不是要入库时 action=unknown',
    prompt:
      `【候选清单】\n${candList}\n\n` +
      `【上一轮助手回复（节选）】\n${prevAssistantText.slice(0, 1500)}\n\n` +
      `【用户本轮指令】\n${userMessage}`,
  })

  if (object.action !== 'enroll') {
    return { targets: [], reason: 'unclear', engine: 'llm' }
  }
  const targets: EnrollTarget[] = []
  for (const ref of object.refs) {
    if (ref.kind === 'slot') {
      const n = ref.slot ?? 0
      if (n >= 1 && n <= candidates.length) {
        targets.push({ ...candidates[n - 1], origin: 'recommend' })
      }
      // 越界 slot：跳过（守卫态度——LLM 说第 7 个但只有 4 个候选时不猜）
    } else if (ref.kind === 'name') {
      const name = (ref.name || '').trim()
      if (!isJunkName(name)) {
        const matched = candidates.find((c) => c.name.includes(name) || name.includes(c.name))
        targets.push(matched ? { ...matched, origin: 'recommend' } : { name, origin: 'name' })
      }
    }
  }
  if (targets.length === 0) {
    return { targets: [], reason: 'unclear', engine: 'llm' }
  }
  return { targets, engine: 'llm' }
}

/**
 * 解析编排（#22）：LLM 主路径 → 失败/异常降级正则。
 * 两条路径产出的 name 都必须过 JUNK 守卫（正则路径内部已过；LLM 路径在上方过滤）。
 */
export async function resolveEnrollTargetsV2(
  userMessage: string,
  candidates: RecommendCandidate[],
  prevAssistantText = '',
): Promise<EnrollParseDecision> {
  try {
    const decision = await extractEnrollIntentLLM(userMessage, candidates, prevAssistantText)
    if (decision.targets.length > 0) return decision
    // LLM 判定 unknown：若正则能给出高置信结果（序号/全部）仍采用，否则尊重 LLM 的 unclear
    const fallback = resolveEnrollTargets(userMessage, candidates)
    if (fallback.targets.length > 0 && fallback.reason !== 'no-candidates') {
      return { ...fallback, engine: 'llm-fallback-regex' }
    }
    return decision
  } catch (err) {
    logger.warn({ err: err as Error }, 'enroll LLM parse failed, fallback to regex')
    return { ...resolveEnrollTargets(userMessage, candidates), engine: 'regex' }
  }
}

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
  /** 上一轮助手回复（供 LLM 指代消解的上下文，#22） */
  prevAssistantText?: string
}): Promise<string> {
  const { userMessage, sessionId, skillContext, prevAssistantText = '' } = args
  const stored = await agentMemory.getJSON<StoredCandidates>(sessionId, CANDIDATE_KEY)
  const candidates = stored?.candidates ?? []

  const { targets, reason, engine } = await resolveEnrollTargetsV2(
    userMessage,
    candidates,
    prevAssistantText,
  )
  // 解析决策日志（#24）：engine / 结果 / 拒绝原因，供语料喂养
  logger.info({ engine, targetCount: targets.length, reason, msg: userMessage.slice(0, 80) }, 'enroll parse decision')

  // ── 对话式确认流（#23）：上一轮挂起的裸名称，本轮用户确认后执行 ──
  const pendingKey = 'pending-enroll'
  const isConfirmMsg = /^(确认|确认入库|对[，,。!！]?$|是[的]?[，,。!！]?$|嗯[嗯]?[，,。!！]?$|可以|没问题)/.test(userMessage.trim())
  if (isConfirmMsg) {
    const pending = await agentMemory.getJSON<StoredCandidates & { names?: string[] }>(sessionId, pendingKey)
    if (pending?.names?.length) {
      await agentMemory.setJSON(sessionId, pendingKey, { candidates: [], names: [] })
      const confirmed: string[] = []
      for (const name of pending.names) {
        try {
          const res = await skillRegistry.execute('lead-action', { name, notes: '由小销推荐入库（用户确认）' }, skillContext)
          const companyRef = (res.data as { company?: { id?: string } } | undefined)?.company
          const readBack = companyRef?.id
            ? await skillContext.prisma.company.findFirst({
                where: { id: companyRef.id, tenantId: skillContext.tenantId, deletedAt: null },
                select: { name: true },
              })
            : null
          if (res.success && readBack?.name === name) confirmed.push(name)
        } catch {
          // 单条失败继续下一条
        }
      }
      return confirmed.length > 0
        ? `已创建目标客户：${confirmed.join('、')}（已落入公海池，可信度中，待销售核实）`
        : '确认入库未成功，请稍后重试或到客户页手动创建。'
    }
  }

  if (targets.length === 0) {
    if (reason === 'no-candidates') {
      return '本轮暂无可入库的目标客户。请先让我「推荐目标客户」，或直接给出客户名（如"把XX公司入库"）。'
    }
    return '未识别出要入库的客户。可以这样表达："把第2个入库"、"全部入库"，或"把XX公司入库"。'
  }

  // ── 置信度分流（#23）：槽位/候选匹配 = 高置信直写；裸名称（origin='name'）先确认再写 ──
  const highConfidence = targets.filter((t) => t.origin === 'recommend')
  const bareNames = targets.filter((t) => t.origin === 'name')
  if (bareNames.length > 0) {
    await agentMemory.setJSON(sessionId, pendingKey, {
      candidates: [],
      names: bareNames.map((t) => t.name),
    })
  }

  const created: string[] = []
  const skipped: string[] = []
  for (const t of highConfidence) {
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
      const companyRef = (res.data as { company?: { id?: string } } | undefined)?.company
      if (!res.success || !companyRef) {
        skipped.push(`${t.name}（${res.error?.message ?? '失败'}）`)
        continue
      }
      if (!companyRef?.id) {
        skipped.push(`${t.name}（返回数据异常）`)
        continue
      }
      // 写后闭环校验（#22）：回读 DB 确认记录真实存在且名称一致——"我做了"必须有库记录佐证
      const readBack = await skillContext.prisma.company.findFirst({
        where: { id: companyRef.id, tenantId: skillContext.tenantId, deletedAt: null },
        select: { name: true },
      })
      if (!readBack || readBack.name !== t.name) {
        skipped.push(`${t.name}（写入后校验不一致，请稍后重试或手动核实）`)
        logger.warn({ expected: t.name, actual: readBack?.name }, 'enroll read-back mismatch')
        continue
      }
      created.push(t.name)
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
  if (bareNames.length > 0) {
    parts.push(
      `待确认新建：${bareNames.map((t) => t.name).join('、')}——我理解为您要新建这些客户，回复「确认」即入库；如果名字不对，请直接说正确的名称`,
    )
  }
  return parts.join('；')
}
