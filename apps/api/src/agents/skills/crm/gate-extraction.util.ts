import type { PrismaClient } from '@prisma/client'
import { agentMemory } from '../../core/agent-memory.js'
import { getComponentLogger } from '../../../infra/logger.js'

/**
 * #30 gate 字段多来源提取（对话侧）
 *
 * 背景：runVisitAnalysis 只认拜访 rawInput，但 gate 信息天然多来源。本模块把提取来源扩展到：
 * 1. 招投标监测对话（bidding_monitor 意图）→ 回填 evidence.bidResult
 * 2. 讨论类对话（visit_analysis / general_chat 含项目上下文）→ 预算/报价/决策人/需求指标
 *
 * 写入治理（《智能体数据写入治理规范》）：两条链路都只创建 AiPendingItem 进待确认队列
 * （itemType 复用现有 'bid_result' / 'budget_signal' / 'price_quote' / 'decision_chain' / 'key_request'），
 * 不直写 project 字段——落库动作由 confirmations.service.applyConfirmedItem 统一执行。
 *
 * 正则兜底模式参照 visits.analysis.controller 的 bidResult 先例；全部失败静默，不阻塞对话流。
 */

const logger = getComponentLogger('gate-extraction')

// ─────────────────────────────── 纯提取函数（可单测） ───────────────────────────────

/** 我方中标/签约表述（触发条件；与 visits.analysis.controller 的 bidResult 兜底同源） */
const BID_RESULT_RE =
  /(?:我方|我们|本公司)\s*(?:成功)?\s*(?:中标|签约|合同金额)[：:]?\s*([^\n。；]+)/

/** 中标/成交公告编号（命中时作为 bidResult 内容的补充锚点） */
const BID_ANNOUNCEMENT_NO_RE =
  /(?:中标|成交)\s*(?:公告)?(?:编号)?[：:]?\s*([A-Z0-9-]{6,20})/

export interface BidResultExtraction {
  content: string
  announcementNo?: string
}

/** 从招投标监测回答中提取我方中标结果；无明确表述返回 null */
export function extractBidResult(text: string): BidResultExtraction | null {
  if (!text) return null
  const main = text.match(BID_RESULT_RE)
  if (!main?.[1]) return null // 主表述未命中不建条目（公告编号只作补充，不单独触发）
  let content = main[1].trim().slice(0, 200)
  const ann = text.match(BID_ANNOUNCEMENT_NO_RE)
  const announcementNo = ann?.[1]
  if (announcementNo && !content.includes(announcementNo)) {
    content = `${content}（公告编号 ${announcementNo}）`
  }
  return announcementNo ? { content, announcementNo } : { content }
}

/** gate 字段四类：预算 / 我方报价 / 拍板人 / 需求指标 */
export type GateField = 'budget' | 'price' | 'decision_maker' | 'requirement'

export interface GateSignalExtraction {
  field: GateField
  /** 落 AiPendingItem.itemData.content 的原文片段 */
  content: string
  /** decision_maker 专用：拍板人姓名 */
  name?: string
  /** decision_maker 专用：职务 */
  role?: string
}

/** 预算金额（模式照 visits.analysis.controller 的 keyInfo.budget 兜底） */
const BUDGET_RE =
  /(?:客户?方?的?)?(?:总)?预算(?:金额)?(?:大约|大概|左右|约|为|是)*\s*([0-9０-９.]+|[一二两三四五六七八九十百]+)\s*万(?:元)?[^\n。；]{0,40}/

/** 我方报价（同上先例：必须是我方报价语境，避免把客户预算当报价） */
const PRICE_RE =
  /(?:总报价|报价总额|我方报价|我方的报价|正式报价|我们的报价)(?:为|约|是)*\s*([0-9０-９.]+|[一二两三四五六七八九十百]+)\s*万(?:元)?[^\n。；]{0,40}/

/** 职务词表（校长/副校长/处长…；用于拍板人姓名+职务模式） */
const ROLE_WORD =
  '(?:常务副|党委副|副)?(?:校长|书记|院长|处长|主任|部长|馆长|董事长|总经理|经理)|C[EI]TO?'

/** 拍板人：关键词先行（"拍板人是张三副校长"）；姓名非贪婪，让职务词吃掉"副校长"整体 */
const DECISION_MAKER_KEYWORD_RE = new RegExp(
  `(?:拍板人?|决策人|最终决策人?|说了算的?人?)(?:是|为)?\\s*([一-龥·]{2,4}?)\\s*(?:[，,、]\\s*)?(${ROLE_WORD})`,
)

/** 拍板人：姓名+职务+决策动词（"张三副校长拍板/说了算"） */
const DECISION_MAKER_VERB_RE = new RegExp(
  `([一-龥·]{2,4}?)\\s*(?:是|担任|任)?\\s*(${ROLE_WORD})[^\\n。；]{0,20}?(?:拍板|说了算|最终决定|负责决策)`,
)

/** 需求指标：带量纲的量化需求 */
const REQUIREMENT_RE =
  /(?:需要|要求|需求指标?|指标)(?:是|为|达到?|不低于|不少于)?\s*([0-9０-９.]+)\s*(台|套|路|间|点位|节点|并发|GB|TB)/

/** 从对话文本（用户消息 + 助手回答）提取 gate 字段信号；按字段去重，每字段取首个命中 */
export function extractGateSignals(text: string): GateSignalExtraction[] {
  if (!text) return []
  const signals: GateSignalExtraction[] = []
  const seen = new Set<GateField>()

  const push = (field: GateField, content: string, extra?: { name?: string; role?: string }) => {
    const c = content.trim().slice(0, 120)
    if (!c || seen.has(field)) return
    seen.add(field)
    signals.push({ field, content: c, ...extra })
  }

  const budget = text.match(BUDGET_RE)
  if (budget) push('budget', budget[0])

  const price = text.match(PRICE_RE)
  if (price) push('price', price[0])

  const dmKeyword = text.match(DECISION_MAKER_KEYWORD_RE)
  if (dmKeyword?.[1] && dmKeyword[2]) {
    push('decision_maker', `${dmKeyword[1]}（${dmKeyword[2]}，决策人）`, {
      name: dmKeyword[1],
      role: dmKeyword[2],
    })
  } else {
    const dmVerb = text.match(DECISION_MAKER_VERB_RE)
    if (dmVerb?.[1] && dmVerb[2]) {
      push('decision_maker', `${dmVerb[1]}（${dmVerb[2]}，决策人）`, {
        name: dmVerb[1],
        role: dmVerb[2],
      })
    }
  }

  const req = text.match(REQUIREMENT_RE)
  if (req) push('requirement', req[0])

  return signals
}

// ─────────────────────────────── 入库编排（待确认队列） ───────────────────────────────

/** gate 字段 → 现有 AiPendingItem.itemType（落库语义见 confirmations.service.applyConfirmedItem） */
const GATE_ITEM_TYPES: Record<GateField, string> = {
  budget: 'budget_signal',       // → financeInfo.budget（仅空时写入）
  price: 'price_quote',          // → financeInfo.price（仅空时写入）
  decision_maker: 'decision_chain', // → decisionMap.nodes（仅空时写入）
  requirement: 'key_request',    // → humanInfo.painPoints 追加
}

/** 会话级节流 KV：记录本会话已建过待确认项的字段（每会话每字段只建一次） */
const GATE_EXTRACTED_KEY = 'gate-fields-extracted'

interface ChatExtractionArgs {
  sessionId: string
  tenantId: string
  userId: string
  prisma: PrismaClient
  projectId: string
}

/**
 * 招投标监测回答 → bidResult 待确认条目（#30 链路一）。
 * 触发条件：bidding_monitor 意图 + 会话带 project 上下文 + 回答有明确我方中标表述。
 * 已有 bidResult 事实（evidence.bidResult）或同内容 pending 条目时跳过（幂等）。
 * 返回创建的条目数（0 或 1）；任何异常由调用方静默。
 */
export async function captureBidResultFromChat(
  args: ChatExtractionArgs & { assistantText: string },
): Promise<number> {
  const { assistantText, sessionId, tenantId, userId, prisma, projectId } = args
  const extraction = extractBidResult(assistantText)
  if (!extraction) {
    logger.debug({ projectId }, 'bid_result extraction: no match')
    return 0
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    select: { ownerId: true, evidence: true },
  })
  if (!project) {
    logger.debug({ projectId }, 'bid_result extraction: project not found')
    return 0
  }

  // 已是事实不重复建（confirmed/modified/auto 的历史条目都已落 evidence.bidResult）
  const evidence = (project.evidence as Record<string, unknown>) || {}
  if (evidence.bidResult) {
    logger.debug({ projectId }, 'bid_result extraction: field already set, skip')
    return 0
  }

  // 同内容 pending 去重（招投标监测常被反复询问；JSON 字段在应用侧比对）
  const pending = await prisma.aiPendingItem.findMany({
    where: { tenantId, projectId, itemType: 'bid_result', status: 'pending' },
    select: { itemData: true },
  })
  if (
    pending.some((p) => (p.itemData as Record<string, unknown>)?.content === extraction.content)
  ) {
    logger.debug({ projectId }, 'bid_result extraction: duplicate pending item, skip')
    return 0
  }

  await prisma.aiPendingItem.create({
    data: {
      tenantId,
      ownerId: project.ownerId || userId,
      projectId,
      itemType: 'bid_result',
      itemData: {
        content: extraction.content,
        announcementNo: extraction.announcementNo,
        source: 'bidding_monitor_chat',
        sessionId,
      },
    },
  })
  logger.info(
    { projectId, sessionId, content: extraction.content.slice(0, 80) },
    'gate extraction decision: bid_result queued from bidding_monitor chat',
  )
  return 1
}

/**
 * 讨论类对话 → gate 字段信号待确认条目（#30 链路二）。
 * 触发条件：visit_analysis / general_chat 意图 + 会话带 project 上下文。
 * 节流：每会话每字段只建一次（Redis session KV，参照 agentMemory.setJSON 模式）。
 * 字段档案已有值（预算/报价/决策链）时同样跳过，避免收件箱噪音。
 * 返回创建的条目数；任何异常由调用方静默。
 */
export async function captureGateSignalsFromChat(
  args: ChatExtractionArgs & { userMessage: string; assistantText: string },
): Promise<number> {
  const { userMessage, assistantText, sessionId, tenantId, userId, prisma, projectId } = args
  const extracted =
    (await agentMemory.getJSON<Record<string, string>>(sessionId, GATE_EXTRACTED_KEY)) || {}

  const signals = extractGateSignals(`${userMessage}\n${assistantText}`).filter(
    (s) => !(s.field in extracted),
  )
  if (signals.length === 0) return 0

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    select: { ownerId: true, financeInfo: true, humanInfo: true, decisionMap: true },
  })
  if (!project) {
    logger.debug({ projectId }, 'gate signal extraction: project not found')
    return 0
  }

  const financeInfo = (project.financeInfo as Record<string, unknown>) || {}
  const humanInfo = (project.humanInfo as Record<string, unknown>) || {}
  const decisionMap = (project.decisionMap as Record<string, unknown>) || {}
  const painPoints = Array.isArray(humanInfo.painPoints) ? (humanInfo.painPoints as unknown[]) : []
  const decisionNodes = Array.isArray(decisionMap.nodes) ? (decisionMap.nodes as unknown[]) : []

  let created = 0
  const createdFields: GateField[] = []
  for (const signal of signals) {
    // 档案已有值跳过（与 applyConfirmedItem 的"仅空时写入"对齐，减少无效待确认项）
    if (signal.field === 'budget' && financeInfo.budget) continue
    if (signal.field === 'price' && financeInfo.price) continue
    if (signal.field === 'decision_maker' && decisionNodes.length > 0) continue
    if (signal.field === 'requirement' && painPoints.includes(signal.content)) continue

    const itemData: Record<string, unknown> = {
      content: signal.content,
      source: 'chat',
      sessionId,
    }
    if (signal.field === 'decision_maker') {
      // decision_chain 落库语义：chain: [{ name, role, attitude }]
      itemData.chain = [{ name: signal.name, role: signal.role, attitude: 'NEUTRAL' }]
    }

    await prisma.aiPendingItem.create({
      data: {
        tenantId,
        ownerId: project.ownerId || userId,
        projectId,
        itemType: GATE_ITEM_TYPES[signal.field],
        itemData: itemData as never,
      },
    })
    // 节流标记：本会话该字段已建过（无论后续对话再聊到多少次）
    extracted[signal.field] = signal.content
    createdFields.push(signal.field)
    created++
  }

  if (created > 0) {
    await agentMemory.setJSON(sessionId, GATE_EXTRACTED_KEY, extracted)
    logger.info(
      { projectId, sessionId, fields: createdFields },
      'gate extraction decision: signals queued from chat',
    )
  }
  return created
}
