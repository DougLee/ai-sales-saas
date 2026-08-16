import { useEffect } from 'react'
import { AlertTriangle, Loader2, Phone, UserRoundPlus } from 'lucide-react'
import { useCompany } from '../../hooks/use-companies.js'
import { firstMissingCriticalRole, missingCriticalRoles, roleMetaOf } from './roles.js'

/**
 * 客户主档行的联系人条带（issue #43）：
 * 展开时走 useCompany 详情接口取 contacts（detail 已带 decisionRole），
 * 每位联系人一行——彩色角色徽章（五角色对齐 #38 矩阵）+ 姓名 + 部门职位 + 电话 tel 链接；
 * 底部做五角色覆盖检查，缺关键角给预警（点击可带角色预选补录）。
 */

export interface StripContact {
  id: string
  name: string
  position?: string
  department?: string
  phone?: string
  decisionRole?: string | null
}

interface ContactStripProps {
  companyId: string
  companyName: string
  /** 展开态由父级行控制；收起时不请求 */
  open: boolean
  /** 「＋ 添加联系人」/「录入第一位联系人」回调（父级打开锁定客户的合一表单），可带角色预选 */
  onAddContact?: (presetRole?: string) => void
  /** 详情数据到达后上报父级（两层筛选的精确筛 + 督导统计用）；readonly = SALES 只读详情，角色不可判 */
  onLoaded?: (companyId: string, contacts: StripContact[], readonly: boolean) => void
  /** 点击联系人姓名跳联系人详情 */
  onOpenContact?: (id: string) => void
}

export default function ContactStrip({
  companyId,
  companyName,
  open,
  onAddContact,
  onLoaded,
  onOpenContact,
}: ContactStripProps) {
  // 复用详情查询：缓存键 ['company', id] 与客户详情抽屉一致（督导检查 fetchQuery 同键，互为缓存）
  const { data, isLoading } = useCompany(open ? companyId : undefined)

  useEffect(() => {
    if (!open || !data) return
    onLoaded?.(companyId, data._readonly ? [] : (data.contacts as StripContact[]), !!data._readonly)
  }, [open, data, companyId, onLoaded])

  if (!open) return null

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 bg-surface-elevated/40 px-4 py-3 text-xs text-text-tertiary">
        <Loader2 size={13} className="animate-spin" /> 正在加载联系人…
      </div>
    )
  }

  if (data?._readonly) {
    return (
      <div className="bg-surface-elevated/40 px-4 py-3 text-xs text-text-tertiary">
        该客户由其他同事负责，仅可查看基本信息，联系人档案不开放。
      </div>
    )
  }

  const contacts = (data?.contacts as StripContact[] | undefined) ?? []
  const missing = missingCriticalRoles(contacts)

  if (contacts.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 bg-surface-elevated/40 px-4 py-3">
        <UserRoundPlus size={15} className="text-text-tertiary" />
        <span className="text-xs text-text-secondary">「{companyName}」还没有联系人档案</span>
        {onAddContact && (
          <button
            type="button"
            onClick={() => onAddContact()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90"
          >
            ＋ 录入第一位联系人
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-surface-elevated/40 px-4 py-2.5">
      <div className="flex flex-col divide-y divide-border/60">
        {contacts.map((c) => {
          const role = roleMetaOf(c.decisionRole)
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
              <span
                className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-pill px-2 text-[11px] font-semibold ${role.badge}`}
                title={`决策角色：${role.label}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${role.dot}`} aria-hidden />
                {role.label}
              </span>
              <button
                type="button"
                onClick={() => onOpenContact?.(c.id)}
                className="text-[13px] font-medium text-text-primary transition-colors hover:text-primary hover:underline"
                title="查看联系人详情"
              >
                {c.name}
              </button>
              <span className="min-w-0 truncate text-xs text-text-tertiary">
                {[c.department, c.position].filter(Boolean).join(' · ') || '部门职位待补充'}
              </span>
              {c.phone ? (
                <a
                  href={`tel:${c.phone}`}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-text-secondary transition-colors hover:text-primary"
                  title={`拨打 ${c.phone}`}
                  aria-label={`拨打 ${c.phone}`}
                >
                  <Phone size={11} /> {c.phone}
                </a>
              ) : (
                <span className="ml-auto shrink-0 text-[11px] text-text-tertiary">电话待补充</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-3 border-t border-border/60 pt-2">
        {missing.length > 0 && onAddContact && (
          <button
            type="button"
            onClick={() => onAddContact(firstMissingCriticalRole(contacts))}
            className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20"
            title="高校坐实规则：建议 ≥2 独立角色交叉印证，点击带角色预选补录"
          >
            <AlertTriangle size={12} /> 缺{missing.join('、')} · 点击补录
          </button>
        )}
        {onAddContact && (
          <button
            type="button"
            onClick={() => onAddContact()}
            className="ml-auto text-xs font-medium text-primary hover:underline"
          >
            ＋ 添加联系人
          </button>
        )}
      </div>
    </div>
  )
}
