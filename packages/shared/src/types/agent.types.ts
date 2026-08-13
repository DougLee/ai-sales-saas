export interface AgentRuntimeContext {
  tenantId: string
  userId: string
  currentEntityType?: 'lead' | 'project' | 'visit'
  currentEntityId?: string
}

export interface AgentExecutionConfig {
  name: string
  systemPromptTemplate: string
  tools: Record<string, unknown>
  maxSteps: number
  temperature?: number
}

export interface AgentMemory {
  sessionId: string
  userId: string
  tenantId: string
  messages: Array<{
    role: 'user' | 'assistant' | 'tool'
    content: string
    toolCalls?: unknown[]
    toolResults?: unknown[]
    timestamp: Date
  }>
  pageContext?: {
    page: string
    entityType?: string
    entityId?: string
  }
  recentEntities: Array<{ type: string; id: string; name: string }>
}
