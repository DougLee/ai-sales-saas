import { useState } from 'react'
import { Check, Pencil, Loader2, ChevronDown, CheckCheck, CircleHelp, Quote } from 'lucide-react'
import {
  useResolveItem,
  useBatchConfirm,
  buildChecklistRow,
  buildFormSpec,
  buildReviewPrompt,
  extractEvidence,
  ITEM_TYPE_LABELS,
  type PendingItem,
} from '../../hooks/use-confirmations.js'

/**
 * 拜访核对卡（V6.2 表单式确认，收件箱与拜访详情页共用）
 *
 * 一次拜访的待确认项按字段分区（跟进任务/预算信息/决策相关人…），
 * 每条一行带勾选框，默认全勾：勾掉不对的 → 一次「确认勾选」。
 * 未勾选的留在收件箱；点「逐条编辑」可对单条修改或驳回。
 */

const SECTION_ORDER = ['task', 'budget_signal', 'decision_chain', 'key_request', 'competitor_mention']

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
  { value: 'URGENT', label: '紧急' },
] as const

const INPUT_CLS =
  'h-9 w-full rounded-xl border border-border bg-background px-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary'

function CheckBox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-checked={checked}
      role="checkbox"
      className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
        checked ? 'border-primary bg-primary text-white' : 'border-border bg-surface hover:border-primary/50'
      }`}
      style={{ width: 18, height: 18 }}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  )
}

/** 逐条编辑态（默认折叠）：一句话 + 判断题 + 可改字段 */
function ConfirmItem({ item }: { item: PendingItem }) {
  const resolve = useResolveItem()
  const prompt = buildReviewPrompt(item)
  const spec = buildFormSpec(item)
  const evidence = extractEvidence(item)
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.fields.map((f) => [f.key, f.value])),
  )
  const busy = resolve.isPending

  const submitModified = () => {
    const d: Record<string, unknown> = { ...item.itemData }
    for (const f of spec.fields) {
      const v = (values[f.key] ?? '').trim()
      d[f.key] = f.inputType === 'datetime' ? (v ? new Date(v).toISOString() : undefined) : v
    }
    resolve.mutate(
      { id: item.id, action: 'modify', modifiedData: d },
      { onSuccess: () => setEditing(false) },
    )
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2.5">
      <p className="text-xs font-medium text-text-tertiary">{ITEM_TYPE_LABELS[item.itemType] || item.itemType}</p>
      <p className="mt-0.5 text-sm text-text-primary">{prompt.statement}</p>

      {spec.tableRows && spec.tableRows.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-elevated text-text-tertiary">
                <th className="px-2.5 py-1.5 text-left font-medium">姓名</th>
                <th className="px-2.5 py-1.5 text-left font-medium">决策角色</th>
                <th className="px-2.5 py-1.5 text-left font-medium">态度</th>
                <th className="px-2.5 py-1.5 text-left font-medium">洞察</th>
              </tr>
            </thead>
            <tbody>
              {spec.tableRows.map((r, i) => (
                <tr key={i} className="border-t border-border/40">
                  <td className="px-2.5 py-1.5 text-text-primary">{r.name}</td>
                  <td className="px-2.5 py-1.5 text-text-secondary">{r.role}</td>
                  <td className="px-2.5 py-1.5 text-text-secondary">{r.attitude}</td>
                  <td className="px-2.5 py-1.5 text-text-tertiary">{r.insight || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {evidence && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-surface-elevated px-2.5 py-1.5 text-xs text-text-tertiary">
          <Quote size={12} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">原文：{evidence}</span>
        </p>
      )}

      {editing && !spec.readonly && (
        <div className="mt-2 grid gap-2 rounded-lg bg-surface-elevated p-2.5 sm:grid-cols-2">
          {spec.fields.map((f) => (
            <div key={f.key} className={f.key === 'title' || f.inputType === 'text' ? 'sm:col-span-2' : ''}>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{f.label}</label>
              {f.inputType === 'priority' ? (
                <div className="flex gap-1.5">
                  {PRIORITY_OPTIONS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, [f.key]: p.value }))}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        values[f.key] === p.value
                          ? 'bg-primary text-white'
                          : 'border border-border bg-surface text-text-secondary hover:bg-surface-elevated'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type={f.inputType === 'datetime' ? 'datetime-local' : 'text'}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className={INPUT_CLS}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1 text-xs text-text-tertiary">
          <CircleHelp size={12} className="shrink-0 text-primary" />
          <span className="truncate">{prompt.question}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                disabled={busy}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-elevated disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={submitModified}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                按修改版录入
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => resolve.mutate({ id: item.id, action: 'reject' })}
                disabled={busy}
                title="AI 理解错了，丢弃这条"
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                驳回
              </button>
              {!spec.readonly && (
                <button
                  onClick={() => setEditing(true)}
                  disabled={busy}
                  title="内容大致对，改一下再录入"
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  <Pencil size={12} />
                  改
                </button>
              )}
              <button
                onClick={() => resolve.mutate({ id: item.id, action: 'confirm' })}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                属实，录入
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VisitReviewCard({ items, subtitle }: { items: PendingItem[]; subtitle?: string }) {
  const batch = useBatchConfirm()
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const [showDetail, setShowDetail] = useState(false)

  const isChecked = (id: string) => !unchecked.has(id)
  const toggle = (id: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const checkedIds = items.filter((i) => isChecked(i.id)).map((i) => i.id)

  // 按字段分区（任务/预算/决策链优先，其余类型排后）
  const byType = new Map<string, PendingItem[]>()
  for (const item of items) {
    const list = byType.get(item.itemType) || []
    list.push(item)
    byType.set(item.itemType, list)
  }
  const orderedTypes = [
    ...SECTION_ORDER.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !SECTION_ORDER.includes(t)),
  ]

  return (
    <div>
      {subtitle && <p className="text-xs text-text-tertiary">{subtitle}</p>}

      <div className="mt-1.5 space-y-3 rounded-lg border border-border/60 bg-background px-3 py-2.5">
        {orderedTypes.map((type) => {
          const rows = byType.get(type)!
          const target = buildFormSpec(rows[0]).targetLabel
          return (
            <div key={type}>
              <h5 className="mb-1 flex items-baseline gap-1.5 text-xs font-medium text-text-secondary">
                {ITEM_TYPE_LABELS[type] || type}
                <span className="font-normal text-text-tertiary">→ 写入：{target}</span>
              </h5>
              <ul className="divide-y divide-border/40">
                {rows.map((item) => {
                  const row = buildChecklistRow(item)
                  const on = isChecked(item.id)
                  return (
                    <li key={item.id} className="flex items-start gap-2 py-1.5">
                      <CheckBox checked={on} onToggle={() => toggle(item.id)} />
                      <span
                        className={`min-w-0 flex-1 text-sm leading-5 ${on ? 'text-text-primary' : 'text-text-tertiary line-through'}`}
                      >
                        {row.text}
                      </span>
                      {row.meta && <span className="shrink-0 text-xs text-text-tertiary">{row.meta}</span>}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
          <button
            onClick={() => setShowDetail((v) => !v)}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
          >
            <ChevronDown size={12} className={`transition-transform ${showDetail ? '' : '-rotate-90'}`} />
            逐条编辑（{items.length}）
          </button>
          <div className="flex items-center gap-2">
            {unchecked.size > 0 && (
              <span className="text-xs text-text-tertiary">未勾选 {unchecked.size} 条将留在收件箱</span>
            )}
            <button
              onClick={() => batch.mutate(checkedIds)}
              disabled={batch.isPending || checkedIds.length === 0}
              title="勾选的都对？一键录入"
              className="flex items-center gap-1.5 rounded-lg bg-success px-3.5 py-1.5 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
            >
              {batch.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={13} />}
              确认勾选（{checkedIds.length} 项）
            </button>
          </div>
        </div>
      </div>

      {showDetail && (
        <div className="mt-2 space-y-1.5">
          {items.map((item) => (
            <ConfirmItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
