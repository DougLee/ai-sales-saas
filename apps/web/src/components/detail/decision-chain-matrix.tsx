import { Phone } from 'lucide-react'

/**
 * 决策链角色矩阵（issue #38）：替代旧版「联系信息」+「关联联系人」两张重复卡。
 * 按 角色（决策者 / 影响力者 / 使用者 / 切入者 / 待定）×联系人 的矩阵视图，
 * 联系人按 decisionRole 分组，未标记角色的进「待定」。
 */

export interface MatrixContact {
  id: string
  name: string
  position?: string
  department?: string
  phone?: string
  email?: string
  decisionRole?: string | null
}

interface RoleDef {
  key: string
  label: string
  hint: string
  badge: string
  dot: string
}

/** 关键角色定义（issue #38 五角色制）：现有 decisionRole 枚举映射进四行 + 待定 */
export const ROLE_DEFS: RoleDef[] = [
  { key: 'DECISION_MAKER', label: '决策者', hint: '拍板签字', badge: 'bg-danger/10 text-danger', dot: 'bg-danger' },
  { key: 'EVALUATOR', label: '影响力者', hint: '影响评价', badge: 'bg-warning/10 text-warning', dot: 'bg-warning' },
  { key: 'USER', label: '使用者', hint: '日常使用', badge: 'bg-success/10 text-success', dot: 'bg-success' },
  { key: 'COACH', label: '切入者', hint: '引荐带路', badge: 'bg-primary/10 text-primary', dot: 'bg-primary' },
]

const PENDING_ROLE: RoleDef = {
  key: '__pending__',
  label: '待定',
  hint: '角色未标记',
  badge: 'bg-surface-elevated text-text-tertiary',
  dot: 'bg-text-tertiary/40',
}

export function groupContactsByRole(contacts: MatrixContact[]) {
  const groups = ROLE_DEFS.map((role) => ({
    role,
    members: contacts.filter((c) => c.decisionRole === role.key),
  }))
  const pending = contacts.filter(
    (c) => !c.decisionRole || !ROLE_DEFS.some((r) => r.key === c.decisionRole),
  )
  return { groups, pending }
}

function ContactChip({ contact, onOpen }: { contact: MatrixContact; onOpen: (id: string) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(contact.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(contact.id)}
      title={`查看 ${contact.name} 详情`}
      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-surface px-2 py-1.5 transition-colors hover:border-primary/30 hover:bg-surface-elevated/60"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-primary text-xs font-bold text-white">
        {contact.name.slice(0, 1)}
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-[13px] font-medium text-text-primary">{contact.name}</span>
        <span className="block truncate text-[11px] text-text-tertiary">
          {[contact.department, contact.position].filter(Boolean).join(' · ') || contact.phone || '—'}
        </span>
      </span>
      {contact.phone && (
        <a
          href={`tel:${contact.phone}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-primary/10 hover:text-primary"
          title={`拨打 ${contact.phone}`}
          aria-label={`拨打 ${contact.phone}`}
        >
          <Phone size={12} />
        </a>
      )}
    </div>
  )
}

function RoleRow({ role, contacts, onOpen }: { role: RoleDef; contacts: MatrixContact[]; onOpen: (id: string) => void }) {
  return (
    <div className="flex gap-3 border-t border-border/60 py-2.5 first:border-t-0 first:pt-0">
      <div className="flex w-[76px] shrink-0 items-start gap-1.5 pt-1.5">
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${role.dot}`} />
        <span className="leading-tight">
          <span className={`block rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${role.badge}`}>{role.label}</span>
          <span className="mt-1 block text-[10px] text-text-tertiary">{role.hint}</span>
        </span>
      </div>
      {contacts.length > 0 ? (
        <div className="flex flex-1 flex-wrap gap-1.5">
          {contacts.map((c) => (
            <ContactChip key={c.id} contact={c} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center pt-1 text-[11px] text-text-tertiary/70">空缺 · 建议补充</div>
      )}
    </div>
  )
}

/**
 * 角色矩阵视图。单联系人小客户不强制五角色（缺失提示仅在 ≥2 人时出现）。
 */
export default function DecisionChainMatrix({
  contacts,
  onOpenContact,
}: {
  contacts: MatrixContact[]
  onOpenContact: (id: string) => void
}) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-text-tertiary">
        暂无关联联系人 · 在「联系人」页为该客户添加成员并标记决策角色
      </div>
    )
  }

  const { groups, pending } = groupContactsByRole(contacts)
  const missingRoles = groups.filter((g) => g.members.length === 0).map((g) => g.role.label)

  return (
    <div>
      {groups.map((g) => (
        <RoleRow key={g.role.key} role={g.role} contacts={g.members} onOpen={onOpenContact} />
      ))}
      {pending.length > 0 && <RoleRow role={PENDING_ROLE} contacts={pending} onOpen={onOpenContact} />}
      {contacts.length >= 2 && missingRoles.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-warning">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
          还缺「{missingRoles.join('、')}」角色——大客户建议补齐关键角色再推进
        </p>
      )}
    </div>
  )
}
