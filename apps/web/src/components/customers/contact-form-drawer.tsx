import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { isValidPhone, normalizePhone, PHONE_ERROR_MESSAGE } from '@ai-sales/shared'
import { useCreateContact, useUpdateContact, type Contact } from '../../hooks/use-contacts.js'
import Drawer from '../ui/drawer.js'
import PhoneInput from '../forms/phone-input.js'
import { toast } from '../../lib/toast.js'
import { ASSIGNABLE_ROLES, isPendingRole } from './roles.js'

/**
 * 联系人表单合一（issue #43）：
 * - 从客户列表主档行打开时传 lockedCompany——所属客户自动锁定（禁止再选），省去 90% 场景的手动选公司
 * - 决策角色色块五选一（四角色 + 待定/清除），色系对齐 #38 矩阵
 * - 打单情报四字段显性化（个人动机/关注点/如何触达/如何说服——表里有但旧表单没露）
 * 独立 /contacts 页复用同一表单（companies 下拉模式）。
 */

interface ContactFormDrawerProps {
  open: boolean
  onClose: () => void
  /** 编辑态传入原联系人；新建不传 */
  initial?: Contact
  /** 锁定所属客户（客户列表条带入口） */
  lockedCompany?: { id: string; name: string }
  /** 角色预选（如条带「缺决策者」预警一键补录） */
  defaultRole?: string
  /** 非锁定模式的客户下拉选项 */
  companies?: Array<{ id: string; name: string }>
}

const INPUT_CLS =
  'h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary'
const TEXTAREA_CLS =
  'w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary'

export default function ContactFormDrawer({
  open,
  onClose,
  initial,
  lockedCompany,
  defaultRole,
  companies = [],
}: ContactFormDrawerProps) {
  const create = useCreateContact()
  const update = useUpdateContact()
  const qc = useQueryClient()
  const editing = !!initial

  // 电话（PhoneInput 受控）与角色（色块选择）不走 FormData
  const [phoneValue, setPhoneValue] = useState('')
  const [role, setRole] = useState('')

  useEffect(() => {
    if (!open) return
    setPhoneValue(initial?.phone || '')
    // 待定桶（未标注 / GATEKEEPER）在色块组里表现为「无选中」
    const initialRole = initial?.decisionRole
    setRole(initialRole && !isPendingRole(initialRole) ? initialRole : defaultRole || '')
  }, [open, initial, defaultRole])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload: Record<string, string> = {}
    fd.forEach((v, k) => {
      if (typeof v === 'string' && v.trim()) payload[k] = v.trim()
    })

    // 电话由受控 PhoneInput 提供，提交前归一化并校验
    const phone = normalizePhone(phoneValue)
    if (phone && !isValidPhone(phone)) {
      toast.error(PHONE_ERROR_MESSAGE)
      return
    }
    if (phone) payload.phone = phone

    const companyId = lockedCompany?.id || payload.companyId
    if (!companyId) {
      toast.error('请选择所属客户')
      return
    }
    payload.companyId = companyId
    if (role) payload.decisionRole = role

    try {
      if (editing && initial) {
        await update.mutateAsync({ id: initial.id, data: payload as never })
      } else {
        await create.mutateAsync(payload as never)
      }
      // 主档视图联动：联系人条带（['company', id]）与列表 _count.contacts（['companies']）同步刷新
      qc.invalidateQueries({ queryKey: ['company'] })
      qc.invalidateQueries({ queryKey: ['companies'] })
      onClose()
    } catch {
      /* 失败不关窗，用户已填内容不丢（错误提示由 hook 的 toast 负责） */
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="md"
      title={
        editing
          ? '编辑联系人'
          : lockedCompany
            ? `为「${lockedCompany.name}」添加联系人`
            : '新建联系人'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">姓名 *</label>
          <input name="name" defaultValue={initial?.name} required className={INPUT_CLS} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">职位</label>
            <input name="position" defaultValue={initial?.position} className={INPUT_CLS} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">部门</label>
            <input name="department" defaultValue={initial?.department} className={INPUT_CLS} />
          </div>
        </div>

        {lockedCompany ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">所属客户</label>
            <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-elevated/50 px-4 text-sm text-text-primary">
              <Lock size={13} className="shrink-0 text-text-tertiary" />
              <span className="truncate font-medium">{lockedCompany.name}</span>
              <span className="ml-auto shrink-0 text-xs text-text-tertiary">已锁定 · 随当前客户保存</span>
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">所属客户 *</label>
            <select name="companyId" defaultValue={initial?.companyId || ''} required className={`${INPUT_CLS} cursor-pointer`}>
              <option value="">请选择客户…</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">电话</label>
            <PhoneInput value={phoneValue} onChange={setPhoneValue} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">邮箱</label>
            <input name="email" type="email" defaultValue={initial?.email} className={INPUT_CLS} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">微信</label>
          <input name="wechat" defaultValue={initial?.wechat} className={INPUT_CLS} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            决策角色 <span className="text-xs font-normal text-text-tertiary">（色系对齐决策链矩阵）</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {ASSIGNABLE_ROLES.map((r) => {
              const active = role === r.key
              return (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRole(active ? '' : r.key)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                    active
                      ? `${r.badge} border-current`
                      : 'border-border bg-surface text-text-secondary hover:border-primary/40 hover:text-text-primary'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${r.dot}`} aria-hidden />
                  {r.label}
                </button>
              )
            })}
            <button
              type="button"
              aria-pressed={role === ''}
              onClick={() => setRole('')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                role === ''
                  ? 'border-current bg-surface-elevated text-text-tertiary'
                  : 'border-border bg-surface text-text-secondary hover:border-primary/40 hover:text-text-primary'
              }`}
              title="不标注角色，进入决策链矩阵的「待定」桶"
            >
              待定
            </button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-3.5">
          <p className="text-xs font-semibold text-text-secondary">
            打单情报 <span className="font-normal text-text-tertiary">（选填 · AI 作战室可用）</span>
          </p>
          <textarea name="personalMotive" rows={2} defaultValue={initial?.personalMotive} className={TEXTAREA_CLS} placeholder="个人动机：他在意什么（升迁 / 省事 / 避责…）" />
          <textarea name="roiConcern" rows={2} defaultValue={initial?.roiConcern} className={TEXTAREA_CLS} placeholder="关注点：他关心产品 / 方案的哪些方面" />
          <textarea name="howToReach" rows={2} defaultValue={initial?.howToReach} className={TEXTAREA_CLS} placeholder="如何触达：他习惯的接触方式与时机" />
          <textarea name="howToPersuade" rows={2} defaultValue={initial?.howToPersuade} className={TEXTAREA_CLS} placeholder="如何说服：有效的说服路径与话术" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={create.isPending || update.isPending}
            onClick={onClose}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={create.isPending || update.isPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {editing ? (update.isPending ? '保存中...' : '保存') : create.isPending ? '创建中...' : '创建'}
          </button>
        </div>
      </form>
    </Drawer>
  )
}
