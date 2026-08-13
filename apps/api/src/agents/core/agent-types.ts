export interface IntentResult {
  intent: string
  confidence: number
  entityType?: string
  entityId?: string
  parameters: Record<string, unknown>
  /** 置信度中等时的最佳猜测意图，回答开头需向用户声明理解 */
  assumed?: boolean
}
