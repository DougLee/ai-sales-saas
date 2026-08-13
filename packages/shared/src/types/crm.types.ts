export type LeadStatus = 'ACTIVE' | 'CONVERTED' | 'LOST' | 'PAUSED'

export type Urgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type DataQuality = 'COMPLETE' | 'PARTIAL' | 'POOR'

export type Attitude = 'SUPPORTIVE' | 'NEUTRAL' | 'RESISTANT' | 'UNKNOWN'

export type DecisionRole = 'COACH' | 'EVALUATOR' | 'DECISION_MAKER' | 'USER' | 'GATEKEEPER'

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export type UserRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'DEPT_HEAD' | 'SALES' | 'VIEWER'

export interface TenantContext {
  tenantId: string
  userId: string
  role: UserRole
}
