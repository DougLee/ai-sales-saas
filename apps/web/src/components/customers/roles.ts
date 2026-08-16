import type { PillTone } from '../ui/status-pill.js'

/**
 * 客户×联系人合一主档视图（issue #43）共享角色元数据。
 *
 * 五角色对齐 #38 决策链矩阵色系：决策者红 / 影响力者橙 / 使用者绿 / 切入者蓝 / 待定灰。
 * DB 的 DecisionRole 枚举含 GATEKEEPER，#38 矩阵将其与「未标注」一起归入「待定」桶，
 * 这里保持同一语义，避免两处口径漂移。
 */

/** 「待定」不是 DB 枚举值，是 未标注/GATEKEEPER 的归桶键（筛选下拉第五项） */
export const PENDING_ROLE_KEY = '__pending__'

export type DecisionRoleKey =
  | 'DECISION_MAKER'
  | 'EVALUATOR'
  | 'USER'
  | 'COACH'
  | 'GATEKEEPER'
  | typeof PENDING_ROLE_KEY

export interface RoleMeta {
  key: DecisionRoleKey
  label: string
  /** StatusPill 语义色（跨组件复用） */
  tone: PillTone
  /** 徽章底色（与 #38 矩阵 badge 同串） */
  badge: string
  /** 圆点色 */
  dot: string
}

/** 五角色（决策者红 / 影响力者橙 / 使用者绿 / 切入者蓝 / 待定灰） */
export const FIVE_ROLES: RoleMeta[] = [
  { key: 'DECISION_MAKER', label: '决策者', tone: 'danger', badge: 'bg-danger/10 text-danger', dot: 'bg-danger' },
  { key: 'EVALUATOR', label: '影响力者', tone: 'warning', badge: 'bg-warning/10 text-warning', dot: 'bg-warning' },
  { key: 'USER', label: '使用者', tone: 'success', badge: 'bg-success/10 text-success', dot: 'bg-success' },
  { key: 'COACH', label: '切入者', tone: 'primary', badge: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  { key: PENDING_ROLE_KEY, label: '待定', tone: 'neutral', badge: 'bg-surface-elevated text-text-tertiary', dot: 'bg-text-tertiary/40' },
]

/** 决策角色 → 五角色元数据；未标注 / GATEKEEPER / 未知值统一归「待定」 */
export function roleMetaOf(decisionRole?: string | null): RoleMeta {
  return FIVE_ROLES.find((r) => r.key === decisionRole) ?? FIVE_ROLES[FIVE_ROLES.length - 1]
}

/** 可指派的四种真实角色（表单色块五选一的前四项；「待定」= 清除标注） */
export const ASSIGNABLE_ROLES: RoleMeta[] = FIVE_ROLES.filter((r) => r.key !== PENDING_ROLE_KEY)

export interface RoleContact {
  decisionRole?: string | null
}

/** 高校坐实规则要求 ≥2 独立角色交叉印证——这两个是督导必查的关键角 */
export const CRITICAL_ROLE_KEYS = ['DECISION_MAKER', 'EVALUATOR'] as const

export function hasRole(contacts: RoleContact[], key: string): boolean {
  return contacts.some((c) => c.decisionRole === key)
}

/** 待定桶：未标注或矩阵未覆盖的枚举值（GATEKEEPER） */
export function isPendingRole(decisionRole?: string | null): boolean {
  return roleMetaOf(decisionRole).key === PENDING_ROLE_KEY
}

/** 缺失的关键角标签（如 ['决策者', '影响力者']），用于条带底部缺角预警；无联系人不预警（另有引导） */
export function missingCriticalRoles(contacts: RoleContact[]): string[] {
  if (contacts.length === 0) return []
  const missing: string[] = []
  for (const key of CRITICAL_ROLE_KEYS) {
    if (!hasRole(contacts, key)) missing.push(roleMetaOf(key).label)
  }
  return missing
}

/** 缺的首个关键角（预警一键补录的角色预选） */
export function firstMissingCriticalRole(contacts: RoleContact[]): string | undefined {
  const missing = missingCriticalRoles(contacts)
  if (missing.length === 0) return undefined
  return missing[0] === '决策者' ? 'DECISION_MAKER' : 'EVALUATOR'
}

/**
 * 督导口径：已有联系人档案但没有决策者。
 * 无联系人的客户归「无联系人」口径（另一个统计格），不在这里双重计数。
 */
export function lacksDecisionMaker(contacts: RoleContact[]): boolean {
  return contacts.length > 0 && !hasRole(contacts, 'DECISION_MAKER')
}
