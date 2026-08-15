import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  X,
  SkipForward,
  Pencil,
  Quote,
  ArrowRight,
  Zap,
  AlertCircle,
} from 'lucide-react'
import Drawer from '../ui/drawer.js'
import { FormInput, FormSelect, FormTextarea } from '../ui/form.js'
import { EmptyState, LoadingState, ErrorState } from '../ui/states.js'
import {
  usePendingItems,
  useResolveItem,
  useBatchConfirm,
  describeItem,
  buildFormSpec,
  extractEvidence,
  ITEM_TYPE_LABELS,
  RAW_INPUT_TYPE_LABELS,
  type PendingItem,
} from '../../hooks/use-confirmations.js'
import { cn } from '../../lib/utils.js'

/**
 * 收件箱过堂抽屉（issue #34 核心重做）
 *
 * - 列表视图：高风险项逐件过堂入口 + 低风险（仅生成任务）快扫区一键批量确认
 * - 过堂视图：大字提取值 + 来源摘录 + 落点说明 + 四动作（确认 Enter / 改后确认 E / 驳回 X / 跳过 S）
 * - 键盘流：抽屉打开且处于过堂视图时生效（输入框聚焦时不抢键）
 * - 留痕条：本次处理记录逐件留痕，可直达落点
 *   （撤销需服务端支持未过堂项的逆操作——现有 revoke 仅限 auto 项，本期不做，见 issue 取舍）
 * - 驳回理由：必选罐头理由 + 可选备注，当前仅本地留痕展示；
 *   落 AI 反馈学习队列需 resolve 接口补 reason 字段（TODO，见 issue #34 关联「小销 P1 进化机制」）
 */

/** 高风险 = 会写客户/项目数据的类型；task 只生成任务，沉底快扫 */
function isHighRisk(item: PendingItem): boolean {
  return item.itemType !== 'task'
}

const REJECT_REASONS = ['来源对不上', '数值有误', '非新信息', '重复'] as const

type TrailAction = 'confirm' | 'modify' | 'reject' | 'batch'

interface TrailEntry {
  id: string
  headline: string
  typeLabel: string
  action: TrailAction
  reason?: string
  targetPath: string
}

const TRAIL_META: Record<TrailAction, { label: string; className: string }> = {
  confirm: { label: '已确认', className: 'bg-success/10 text-success' },
  modify: { label: '人工微调后确认', className: 'bg-primary/10 text-primary' },
  reject: { label: '已驳回', className: 'bg-danger/10 text-danger' },
  batch: { label: '批量确认', className: 'bg-success/10 text-success' },
}

function targetPathOf(item: PendingItem): string {
  if (item.itemType === 'task') return '/tasks'
  if (item.projectId) return `/projects?id=${item.projectId}`
  if (item.context?.leadId) return `/leads?id=${item.context.leadId}`
  return '/confirmations'
}

function contextLine(item: PendingItem): string {
  const ctx = item.context
  const parts: string[] = []
  if (ctx?.companyName) parts.push(ctx.companyName)
  if (ctx?.projectName) parts.push(ctx.projectName)
  if (ctx?.visitTime) {
    parts.push(
      new Date(ctx.visitTime).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    )
  }
  if (ctx?.rawInputType) parts.push(RAW_INPUT_TYPE_LABELS[ctx.rawInputType] || ctx.rawInputType)
  if (ctx?.contactName) parts.push(`拜访对象：${ctx.contactName}`)
  return parts.join(' · ')
}

interface InboxDrawerProps {
  open: boolean
  onClose: () => void
  /** 从战役卡提醒条直达某一条的过堂视图 */
  focusItemId?: string | null
  onFocusConsumed?: () => void
}

export function InboxDrawer({ open, onClose, focusItemId, onFocusConsumed }: InboxDrawerProps) {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = usePendingItems({ status: 'pending' })
  const resolve = useResolveItem()
  const batchConfirm = useBatchConfirm()

  const items = useMemo(() => data ?? [], [data])
  const highRisk = useMemo(() => items.filter(isHighRisk), [items])
  const quickScan = useMemo(() => items.filter((i) => !isHighRisk(i)), [items])

  const [order, setOrder] = useState<string[] | null>(null)
  const [mode, setMode] = useState<'list' | 'review'>('list')
  const [editing, setEditing] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [trail, setTrail] = useState<TrailEntry[]>([])
  /** 本次开抽屉时的总件数（进度分母） */
  const [initialTotal, setInitialTotal] = useState<number | null>(null)
  /** 快扫区勾选（null = 默认全选） */
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const busyRef = useRef(false)

  // 开抽屉时捕获进度分母；关抽屉重置（重开重新计数）
  useEffect(() => {
    if (!open) {
      setInitialTotal(null)
      setMode('list')
      setEditing(false)
      setRejecting(false)
      return
    }
    if (initialTotal === null && !isLoading) setInitialTotal(items.length)
  }, [open, isLoading, items.length, initialTotal])

  // 战役卡提醒条 / 横幅预览直达某一条
  useEffect(() => {
    if (!open || !focusItemId) return
    const target = items.find((i) => i.id === focusItemId)
    if (!target) {
      onFocusConsumed?.()
      return
    }
    const others = highRisk.filter((i) => i.id !== focusItemId).map((i) => i.id)
    setOrder([focusItemId, ...others])
    setMode('review')
    onFocusConsumed?.()
  }, [open, focusItemId, items, highRisk, onFocusConsumed])

  /** 过堂队列：本地顺序（跳过会转队尾）∩ 当前仍 pending 的高风险项，新到件自动追加 */
  const effectiveOrder = useMemo(() => {
    const present = new Set(highRisk.map((i) => i.id))
    const base = (order ?? highRisk.map((i) => i.id)).filter((id) => present.has(id))
    const known = new Set(base)
    for (const i of highRisk) {
      if (!known.has(i.id)) base.push(i.id)
    }
    return base
  }, [highRisk, order])

  const currentId = effectiveOrder[0]
  const currentItem = currentId ? highRisk.find((i) => i.id === currentId) : undefined

  const processed = initialTotal !== null ? Math.max(0, initialTotal - items.length) : 0

  const pushTrail = (entry: TrailEntry) => setTrail((t) => [entry, ...t])

  const resetSubModes = () => {
    setEditing(false)
    setRejecting(false)
    setRejectReason('')
    setRejectNote('')
    setEditValues({})
  }

  const confirmCurrent = () => {
    if (!currentItem || busyRef.current) return
    busyRef.current = true
    resolve.mutate(
      { id: currentItem.id, action: 'confirm' },
      {
        onSuccess: () => {
          pushTrail({
            id: currentItem.id,
            headline: describeItem(currentItem).headline,
            typeLabel: ITEM_TYPE_LABELS[currentItem.itemType] || currentItem.itemType,
            action: 'confirm',
            targetPath: targetPathOf(currentItem),
          })
          resetSubModes()
        },
        onSettled: () => {
          busyRef.current = false
        },
      },
    )
  }

  const startEdit = () => {
    if (!currentItem) return
    const spec = buildFormSpec(currentItem)
    if (spec.readonly) return
    setEditValues(Object.fromEntries(spec.fields.map((f) => [f.key, f.value])))
    setEditing(true)
    setRejecting(false)
  }

  const submitModify = () => {
    if (!currentItem || busyRef.current) return
    busyRef.current = true
    const spec = buildFormSpec(currentItem)
    const modifiedData: Record<string, unknown> = { ...(currentItem.itemData || {}) }
    for (const f of spec.fields) {
      modifiedData[f.key] = editValues[f.key] ?? f.value
    }
    resolve.mutate(
      { id: currentItem.id, action: 'modify', modifiedData },
      {
        onSuccess: () => {
          pushTrail({
            id: currentItem.id,
            headline: String(modifiedData.title || modifiedData.content || describeItem(currentItem).headline),
            typeLabel: ITEM_TYPE_LABELS[currentItem.itemType] || currentItem.itemType,
            action: 'modify',
            targetPath: targetPathOf(currentItem),
          })
          resetSubModes()
        },
        onSettled: () => {
          busyRef.current = false
        },
      },
    )
  }

  const submitReject = () => {
    if (!currentItem || busyRef.current) return
    if (!rejectReason) return
    busyRef.current = true
    // TODO(#34): 理由进 AI 反馈学习队列需后端 resolve 接口补 reason 字段，当前仅本地留痕
    resolve.mutate(
      { id: currentItem.id, action: 'reject' },
      {
        onSuccess: () => {
          pushTrail({
            id: currentItem.id,
            headline: describeItem(currentItem).headline,
            typeLabel: ITEM_TYPE_LABELS[currentItem.itemType] || currentItem.itemType,
            action: 'reject',
            reason: rejectReason + (rejectNote.trim() ? `：${rejectNote.trim()}` : ''),
            targetPath: targetPathOf(currentItem),
          })
          resetSubModes()
        },
        onSettled: () => {
          busyRef.current = false
        },
      },
    )
  }

  const skipCurrent = () => {
    if (!currentId) return
    setOrder([...effectiveOrder.slice(1), currentId])
    resetSubModes()
  }

  // 键盘流：Enter=确认 / E=修改 / X=驳回 / S=跳过（输入控件聚焦、按钮回车场景不抢键）
  useEffect(() => {
    if (!open || mode !== 'review' || !currentItem) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const inField =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (inField) return
      // 按钮聚焦时 Enter 交给按钮自身的 click，避免双触发
      if (t?.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return
      if (busyRef.current || resolve.isPending || batchConfirm.isPending) return

      const key = e.key.toLowerCase()
      if (editing) {
        if (e.key === 'Enter') {
          e.preventDefault()
          submitModify()
        }
        return
      }
      if (rejecting) {
        if (e.key === 'Enter' && rejectReason) {
          e.preventDefault()
          submitReject()
        }
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        confirmCurrent()
      } else if (key === 'x') {
        e.preventDefault()
        setRejecting(true)
      } else if (key === 's') {
        e.preventDefault()
        skipCurrent()
      } else if (key === 'e') {
        e.preventDefault()
        startEdit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const openReviewAt = (id: string) => {
    setOrder([id, ...effectiveOrder.filter((x) => x !== id)])
    setMode('review')
    resetSubModes()
  }

  const selectedQuickIds = quickScan.filter((i) => !deselected.has(i.id)).map((i) => i.id)

  const batchConfirmSelected = () => {
    if (selectedQuickIds.length === 0 || busyRef.current) return
    busyRef.current = true
    batchConfirm.mutate(selectedQuickIds, {
      onSuccess: (res) => {
        pushTrail({
          id: `batch-${Date.now()}`,
          headline: `快扫区一键确认 ${res.confirmed} 件任务生成`,
          typeLabel: '跟进任务',
          action: 'batch',
          targetPath: '/tasks',
        })
      },
      onSettled: () => {
        busyRef.current = false
      },
    })
  }

  const spec = currentItem ? buildFormSpec(currentItem) : null
  const description = currentItem ? describeItem(currentItem) : null
  const evidence = currentItem ? extractEvidence(currentItem) : null

  return (
    <Drawer open={open} onClose={onClose} title="收件箱过堂" width="27rem">
      {/* 顶部进度 */}
      {items.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-surface-elevated/40 px-3 py-2">
          <span className="text-xs text-text-secondary">
            已处理 <span className="font-semibold text-success">{processed}</span> /{' '}
            {initialTotal ?? items.length + processed}
          </span>
          <span className="text-xs text-text-tertiary">剩余 {items.length} 件</span>
        </div>
      )}

      {isLoading ? (
        <LoadingState label="加载待确认项..." />
      ) : isError ? (
        <ErrorState message="待确认项加载失败" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={processed > 0 ? '本次已全部过堂完毕' : '收件箱已清空'}
          description="AI 提取的信息都已确认，新提取的产物会自动进入这里"
        />
      ) : mode === 'review' && currentItem && spec && description ? (
        /* ---------- 单条过堂视图 ---------- */
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setMode('list')}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
          >
            ← 返回列表
          </button>

          {/* 类型 + 上下文 */}
          <div className="space-y-1.5">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {ITEM_TYPE_LABELS[currentItem.itemType] || currentItem.itemType}
            </span>
            <p className="text-xs text-text-tertiary">{contextLine(currentItem)}</p>
          </div>

          {/* 大字提取值（或行内编辑） */}
          {editing ? (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
              {spec.fields.map((f) =>
                f.inputType === 'priority' ? (
                  <FormSelect
                    key={f.key}
                    size="sm"
                    label={f.label}
                    value={editValues[f.key] ?? f.value}
                    onChange={(e) => setEditValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  >
                    <option value="HIGH">高</option>
                    <option value="MEDIUM">中</option>
                    <option value="LOW">低</option>
                  </FormSelect>
                ) : (
                  <FormInput
                    key={f.key}
                    size="sm"
                    label={f.label}
                    type={f.inputType === 'datetime' ? 'datetime-local' : 'text'}
                    value={editValues[f.key] ?? f.value}
                    onChange={(e) => setEditValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                ),
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={submitModify}
                  disabled={resolve.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  <Check size={13} /> 按此确认
                </button>
                <button
                  type="button"
                  onClick={resetSubModes}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated"
                >
                  取消
                </button>
                <span className="ml-auto text-[10px] text-text-tertiary">Enter 提交</span>
              </div>
            </div>
          ) : (
            <p className="text-base font-semibold leading-relaxed text-text-primary">{description.headline}</p>
          )}

          {/* 结构化字段 */}
          {description.fields.length > 0 && !editing && (
            <div className="space-y-1">
              {description.fields.map((f) => (
                <p key={f.label} className="text-xs text-text-secondary">
                  <span className="text-text-tertiary">{f.label}：</span>
                  {f.value}
                </p>
              ))}
            </div>
          )}

          {/* 来源摘录（证据原文） */}
          {evidence && (
            <div className="rounded-xl border border-border bg-background px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[11px] font-medium text-text-tertiary">
                  <Quote size={11} /> 来源摘录
                </span>
                {/* TODO(#33/#34): EvidenceSource 落表后接时间戳跳播录音原句 */}
                {currentItem.visitId && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      navigate(`/visits?id=${currentItem.visitId}`)
                    }}
                    className="flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                  >
                    查看拜访原文 <ArrowRight size={10} />
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-text-secondary">{evidence}</p>
            </div>
          )}

          {/* 落点说明 */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
            <p className="text-[11px] font-medium text-primary">落点</p>
            <p className="mt-1 text-xs text-text-secondary">
              确认后写入：<span className="font-medium text-text-primary">{spec.targetLabel}</span>
            </p>
            <p className="mt-0.5 text-xs text-text-tertiary">{description.consequence}</p>
            {spec.tableRows && spec.tableRows.length > 0 && (
              <div className="mt-2 space-y-1">
                {spec.tableRows.map((r, i) => (
                  <p key={i} className="text-xs text-text-secondary">
                    {r.name}（{r.role}）{r.attitude !== '-' ? ` · 态度：${r.attitude}` : ''}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* 驳回面板（必选理由） */}
          {rejecting && (
            <div className="space-y-2.5 rounded-xl border border-danger/30 bg-danger/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-danger">
                <AlertCircle size={13} /> 驳回理由（必选）
              </p>
              <div className="grid grid-cols-2 gap-2">
                {REJECT_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRejectReason(r)}
                    className={cn(
                      'rounded-lg border px-2 py-1.5 text-xs transition-colors',
                      rejectReason === r
                        ? 'border-danger bg-danger/10 font-medium text-danger'
                        : 'border-border text-text-secondary hover:border-danger/40',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <FormTextarea
                label="补充说明（选填）"
                rows={2}
                className="text-xs"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="写给 AI 的纠错反馈，帮它下次提取更准"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={submitReject}
                  disabled={!rejectReason || resolve.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  <X size={13} /> 确认驳回
                </button>
                <button
                  type="button"
                  onClick={resetSubModes}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 四动作 */}
          {!editing && !rejecting && (
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={confirmCurrent}
                disabled={resolve.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Check size={14} /> 确认
                <Kbd>Enter</Kbd>
              </button>
              <button
                type="button"
                onClick={startEdit}
                disabled={resolve.isPending || spec.readonly}
                title={spec.readonly ? '结构化名单不支持文本微调' : undefined}
                className="flex items-center gap-1 rounded-xl border border-border px-2.5 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-elevated disabled:opacity-40"
              >
                <Pencil size={13} /> 修改 <Kbd>E</Kbd>
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={resolve.isPending}
                className="flex items-center gap-1 rounded-xl border border-danger/30 px-2.5 py-2 text-xs text-danger transition-colors hover:bg-danger/5 disabled:opacity-50"
              >
                <X size={13} /> 驳回 <Kbd>X</Kbd>
              </button>
              <button
                type="button"
                onClick={skipCurrent}
                disabled={resolve.isPending}
                title="移到队尾稍后处理"
                className="flex items-center gap-1 rounded-xl border border-border px-2.5 py-2 text-xs text-text-tertiary transition-colors hover:bg-surface-elevated disabled:opacity-50"
              >
                <SkipForward size={13} /> 跳过 <Kbd>S</Kbd>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ---------- 列表视图 ---------- */
        <div className="space-y-4">
          {highRisk.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-text-primary">
                需逐件过堂
                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  {highRisk.length}
                </span>
              </h4>
              <p className="mb-2 text-xs text-text-tertiary">确认前请核对来源与落点，键盘 Enter / X / S 全程可操作</p>
              <div className="space-y-2">
                {effectiveOrder.map((id) => {
                  const item = highRisk.find((i) => i.id === id)
                  if (!item) return null
                  const desc = describeItem(item)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => openReviewAt(id)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/30"
                    >
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {ITEM_TYPE_LABELS[item.itemType] || item.itemType}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
                          {desc.headline}
                        </span>
                        <ArrowRight size={13} className="shrink-0 text-text-tertiary" />
                      </div>
                      <p className="mt-1 truncate text-[11px] text-text-tertiary">
                        {[item.context?.companyName, item.context?.projectName].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {quickScan.length > 0 && (
            <div>
              <h4 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-text-primary">
                <Zap size={14} className="text-success" />
                快扫区 · 任务生成
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  {quickScan.length}
                </span>
              </h4>
              <p className="mb-2 text-xs text-text-tertiary">低风险：只生成跟进任务，不写客户档案，可一键确认</p>
              <div className="space-y-1.5">
                {quickScan.map((item) => {
                  const checked = !deselected.has(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setDeselected((prev) => {
                          const next = new Set(prev)
                          if (next.has(item.id)) next.delete(item.id)
                          else next.add(item.id)
                          return next
                        })
                      }
                      className="flex w-full items-center gap-2.5 rounded-lg bg-surface-elevated/50 px-3 py-2 text-left hover:bg-surface-elevated"
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          checked ? 'border-primary bg-primary text-white' : 'border-border text-transparent',
                        )}
                      >
                        <Check size={11} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                        {String(item.itemData?.title || '')}
                        {item.itemData?.deadline
                          ? ` · 截止 ${new Date(String(item.itemData.deadline)).toLocaleDateString('zh-CN')}`
                          : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={batchConfirmSelected}
                disabled={selectedQuickIds.length === 0 || batchConfirm.isPending}
                className="mt-2 w-full rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50"
              >
                一键确认 {selectedQuickIds.length} 件任务
              </button>
            </div>
          )}
        </div>
      )}

      {/* 留痕条 */}
      {trail.length > 0 && (
        <div className="mt-5 border-t border-border pt-3">
          <h4 className="mb-2 text-xs font-medium text-text-secondary">本次处理 · {trail.length} 件</h4>
          <div className="space-y-1.5">
            {trail.slice(0, 8).map((entry) => {
              const meta = TRAIL_META[entry.action]
              return (
                <div key={entry.id} className="flex items-center gap-2 text-xs">
                  <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', meta.className)}>
                    {meta.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-text-secondary" title={entry.reason}>
                    {entry.headline}
                    {entry.reason && <span className="text-text-tertiary">（{entry.reason}）</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      navigate(entry.targetPath)
                    }}
                    className="shrink-0 text-[11px] text-primary hover:underline"
                  >
                    直达落点
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Drawer>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="ml-0.5 rounded border border-current px-1 text-[9px] font-normal leading-none opacity-70">
      {children}
    </kbd>
  )
}
