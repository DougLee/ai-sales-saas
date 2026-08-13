/**
 * 输出安全护栏 — 对 AI 生成的文本进行事后校验
 * 拦截编造数据、过度承诺、敏感信息泄露
 */

const FABRICATION_PATTERNS = [
  /我有权限|我可以帮您.*(删除|修改|更新).*(所有|全部|批量)/i,
  /系统显示.*(密码|密钥|token|身份证号|银行卡)/i,
  /据我了解.*(内部消息|未公开|机密)/i,
  /我可以直接.*(操作|执行|修改).*(数据库|服务器)/i,
  /(?:据我所知|据了解|据悉).*?(?:校长|处长|院长|主任|老师|教授).*?(?:电话|手机|微信|邮箱)/i,
  /(?:预算|金额|经费)\s*[:：是]\s*\d+\s*(?:万|千元|元).*?(?:左右|大概|可能|左右|预计)/i,
  /(?:联系人|负责人|决策人)\s*[:：是]\s*["']?[^"'，。\n]{2,8}["']?\s*(?:，|电话|手机)/i,
  /(?:主要联系人|关键决策人|项目负责人|核心联系人)\s*[:：是]\s*["']?([一-龥]{2,4})["']?/i,
  /我查看了.*记录，发现.*(?:联系人|负责人|决策人|副院长|院长|主任|教授)/i,
  /与该项目相关的记录.*发现.*(?:联系人|负责人|决策人|副院长|院长|主任|教授)/i,
  /联系CRM中的|联系 CRM 中的|CRM中的|CRM 中的\s*[一-龥]{2,4}(?:教授|老师|经理|院长|主任|处长)/i,
  /(?:张|王|李|刘|陈|杨|赵|黄|周|吴|徐|孙|胡|朱|高|林|何|郭|马|罗)[一-龥]{1,3}(?:教授|老师|经理|院长|主任|处长|副校长|校长)/i,
  /(?:建议|下一步|行动).*?(?:联系|拜访|约谈).*?(?:张|王|李|刘|陈|杨|赵|黄|周|吴|徐|孙|胡|朱|高|林|何|郭|马|罗)[一-龥]{1,3}/i,
]

const OVER_PROMISE_PATTERNS = [
  /保证.*(100%|绝对|一定).*(成功|赢单|签约)/i,
  /只要.*就.*(肯定|绝对|必然)/i,
]

export interface GuardrailResult {
  passed: boolean
  violations: string[]
  severity: 'warn' | 'block'
}

/**
 * 对 AI 回复文本执行安全扫描
 */
export function scanOutput(text: string): GuardrailResult {
  const violations: string[] = []

  for (const pattern of FABRICATION_PATTERNS) {
    if (pattern.test(text)) {
      violations.push('检测到可能的编造或权限夸大表述')
      break
    }
  }

  for (const pattern of OVER_PROMISE_PATTERNS) {
    if (pattern.test(text)) {
      violations.push('检测到过度承诺表述')
      break
    }
  }

  // 检测是否引用了未经验证的"具体数字"
  const unverifiedStats = text.match(/(?:根据|系统显示|数据显示).*?(\d+%?\s*(?:客户|转化率|胜率|金额))/gi)
  if (unverifiedStats && unverifiedStats.length > 2) {
    violations.push('回复中包含过多未经验证的统计数据')
  }

  const severity = violations.some((v) => v.includes('权限') || v.includes('数据库')) ? 'block' : 'warn'

  return {
    passed: violations.length === 0,
    violations,
    severity,
  }
}

/**
 * 工具调用参数校验 — 防止危险参数
 */
export function validateToolInput(toolName: string, args: unknown): { valid: boolean; error?: string } {
  // 禁止空条件批量操作
  if (['updateMany', 'deleteMany'].some((m) => toolName.toLowerCase().includes(m.toLowerCase()))) {
    const a = args as Record<string, unknown>
    if (!a.where || Object.keys(a.where).length === 0) {
      return { valid: false, error: '批量操作必须提供 where 条件' }
    }
  }

  // 禁止删除全表
  if (toolName.toLowerCase().includes('delete') && !toolName.toLowerCase().includes('deleteMany')) {
    const a = args as Record<string, unknown>
    if (!a.id && !a.where) {
      return { valid: false, error: '删除操作必须指定 id 或 where' }
    }
  }

  return { valid: true }
}

/**
 * 工具调用审计记录
 */
export interface ToolAuditLog {
  toolName: string
  input: unknown
  output: unknown
  userId: string
  tenantId: string
  timestamp: string
  durationMs: number
  error?: string
}

export function createAuditLog(
  toolName: string,
  input: unknown,
  output: unknown,
  userId: string,
  tenantId: string,
  durationMs: number,
  error?: string
): ToolAuditLog {
  return {
    toolName,
    input,
    output,
    userId,
    tenantId,
    timestamp: new Date().toISOString(),
    durationMs,
    error,
  }
}
