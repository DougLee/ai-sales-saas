import type { z } from 'zod'
import type { IntentResult } from '../core/agent-types.js'

export interface AgentContext {
  intent: IntentResult
  userRole: string
  tenantId: string
  userId: string
  page?: string
  entityType?: string
  entityId?: string
  prisma: unknown
}

export interface ExpertAgent {
  /** 匹配的意图标识 */
  intent: string
  /** 中文名称（用于日志和调试） */
  label: string
  /** 适用页面（可选，用于二次校验） */
  applicablePages?: string[]
  /** 适用角色（可选，用于二次校验） */
  applicableRoles?: string[]
  /** 该专家的完整业务知识 system prompt */
  systemPrompt: string
  /** 结构化输出 JSON Schema（Zod），前端可据此渲染 */
  outputSchema?: z.ZodType<unknown>
  /** 推荐工具（建议 LLM 优先调用的工具名） */
  toolPreferences?: string[]
  /** 该场景允许的最大工具调用步数（默认 3） */
  maxSteps?: number
  /** DeepSeek 无工具模式下的数据预注入（返回要追加到 system prompt 的文本） */
  preInject?: (ctx: AgentContext) => Promise<string>
}
