import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Inbox,
  X,
  Loader2,
  ChevronDown,
  FileText,
  Sparkles,
  Undo2,
  Zap,
  ListChecks,
  SplitSquareHorizontal,
} from 'lucide-react'
import {
  usePendingItems,
  useResolveItem,
  groupByEntity,
  groupVisitBlocks,
  entityKindLabel,
  ITEM_TYPE_LABELS,
  type EntityGroup,
  type PendingItem,
} from '../hooks/use-confirmations.js'
import VisitReviewCard from '../components/confirmations/visit-review-card.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'

/**
 * 待确认收件箱（V6.2 分级信任 + 表单式确认；#42 归类确认）
 *
 * - 确认单元 = 一次拜访一张核对卡：按字段分区、逐条勾选、一次确认
 * - #42 任务包：一次提取的 N 条动作 = 1 包（主线任务 + 步骤清单），支持逐条勾选与「单开某步」
 * - 低风险信息（客户诉求/竞品）自动生效且按批落库，在「已自动录入」区可按批撤销（可挑单条保留）
 * - 只有 任务包/预算/决策链 需要人工把关
 */

/** #42 类级条目（批 payload）的人读标签（ITEM_TYPE_LABELS 未覆盖的新类型） */
const GROUP_TYPE_LABELS: Record<string, string> = {
  task_package: '任务包',
  pain_points_group: '客户诉求',
  competitors_group: '竞品动态',
}

function typeLabelOf(itemType: string): string {
  return GROUP_TYPE_LABELS[itemType] || ITEM_TYPE_LABELS[itemType] || itemType
}

/** 读侧兼容（#42）：类级条目统一解包为字符串数组；旧单条 payload（无 items）包装为单元素数组 */
function groupItemsOf(item: PendingItem): string[] {
  const d = item.itemData || {}
  if (Array.isArray(d.items)) return d.items.map((v) => String(v ?? '').trim()).filter(Boolean)
  const single = String(d.content ?? d.title ?? '').trim()
  return single ? [single] : []
}

interface PackageStep {
  title: string
  deadline?: string
}

/** 任务包步骤解包（兼容同上：无 actions 时回落 title/content 单元素） */
function packageStepsOf(item: PendingItem): PackageStep[] {
  const d = item.itemData || {}
  if (Array.isArray(d.actions)) {
    return d.actions
      .map((v) => {
        const a = (v || {}) as Record<string, unknown>
        return { title: String(a.title ?? '').trim(), deadline: a.deadline ? String(a.deadline) : undefined }
      })
      .filter((s) => s.title)
  }
  const single = String(d.title ?? d.content ?? '').trim()
  return single ? [{ title: single }] : []
}

function formatDeadline(v: unknown): string | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('zh-CN')
}

/** 任务包核对卡（#42）：主线标题 + 步骤编号列表 + 确认全部 / 逐条勾选确认 / 单开某步 */
function TaskPackageCard({ item }: { item: PendingItem }) {
  const resolve = useResolveItem()
  const steps = packageStepsOf(item)
  const packageDeadline = item.itemData?.deadline ? String(item.itemData.deadline) : null
  const mainTitle = String(item.itemData?.title ?? '').trim() || steps[0]?.title || '拜访跟进任务包'
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const selected = steps.filter((_, i) => !excluded.has(i))
  const busy = resolve.isPending

  const confirmAll = () => resolve.mutate({ id: item.id, action: 'confirm' })

  const confirmSelected = () => {
    if (selected.length === steps.length) return confirmAll()
    if (selected.length === 0) return
    resolve.mutate({
      id: item.id,
      action: 'modify',
      modifiedData: {
        ...item.itemData,
        title: selected[0].title,
        content: selected.map((s) => s.title).join('；'),
        actions: selected.map((s) => ({ title: s.title })),
      },
    })
  }

  /** 单开某步（逃生门）：该步独立成任务，其余步骤仍按主线任务包确认 */
  const splitStep = (index: number) => {
    const step = steps[index]
    const rest = steps.filter((_, i) => i !== index)
    if (rest.length === 0) return confirmAll() // 单步包无需拆
    resolve.mutate({
      id: item.id,
      action: 'modify',
      modifiedData: {
        ...item.itemData,
        title: rest[0].title,
        content: rest.map((s) => s.title).join('；'),
        actions: rest.map((s) => ({ title: s.title })),
        standaloneActions: [{ title: step.title, deadline: packageDeadline || undefined }],
      },
    })
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <h5 className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <ListChecks size={13} className="text-primary" />
          任务包 · 确认后生成 1 个主线任务（{steps.length} 步）
        </h5>
        {formatDeadline(packageDeadline) && (
          <span className="shrink-0 text-[11px] text-text-tertiary">截止 {formatDeadline(packageDeadline)}</span>
        )}
      </div>
      <p className="mt-1 text-sm font-medium text-text-primary">{mainTitle}</p>
      <ul className="mt-1 divide-y divide-border/40">
        {steps.map((step, i) => {
          const on = !excluded.has(i)
          return (
            <li key={`${i}-${step.title}`} className="flex items-center gap-2 py-1.5">
              <button
                type="button"
                aria-checked={on}
                role="checkbox"
                onClick={() =>
                  setExcluded((prev) => {
                    const next = new Set(prev)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    return next
                  })
                }
                className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                  on ? 'border-primary bg-primary text-white' : 'border-border bg-surface'
                }`}
                style={{ width: 18, height: 18 }}
              >
                {on && <span className="text-xs leading-none">✓</span>}
              </button>
              <span
                className={`min-w-0 flex-1 text-sm leading-5 ${on ? 'text-text-primary' : 'text-text-tertiary line-through'}`}
              >
                <span className="mr-1 text-text-tertiary">{i + 1}.</span>
                {step.title}
              </span>
              <button
                type="button"
                onClick={() => splitStep(i)}
                disabled={busy}
                title="这一步需要独立跟踪？拆成单独的任务，其余步骤照常进主线任务"
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-text-tertiary transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              >
                <SplitSquareHorizontal size={11} /> 单开
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border/40 pt-2">
        <p className="text-[11px] text-text-tertiary">未勾选的步骤不会生成</p>
        <div className="flex shrink-0 items-center gap-2">
          {excluded.size > 0 && (
            <button
              type="button"
              onClick={confirmSelected}
              disabled={busy || selected.length === 0}
              className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50"
            >
              只确认勾选的 {selected.length} 步
            </button>
          )}
          <button
            type="button"
            onClick={confirmAll}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-success px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : null}
            确认全部（{steps.length} 步）
          </button>
        </div>
      </div>
    </div>
  )
}

/** 类级待确认卡（#42）：诉求/竞品批 payload 的类级确认（条目列表，默认全选） */
function GroupItemsCard({ item }: { item: PendingItem }) {
  const resolve = useResolveItem()
  const items = groupItemsOf(item)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const selected = items.filter((v) => !excluded.has(v))
  const busy = resolve.isPending

  const confirmSelected = () => {
    if (selected.length === items.length) {
      resolve.mutate({ id: item.id, action: 'confirm' })
      return
    }
    if (selected.length === 0) return
    resolve.mutate({
      id: item.id,
      action: 'modify',
      modifiedData: { ...item.itemData, items: selected, content: selected.join('；') },
    })
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2.5">
      <h5 className="text-xs font-medium text-text-secondary">
        {typeLabelOf(item.itemType)} · {items.length} 条（确认后批量写入项目档案）
      </h5>
      <ul className="mt-1 divide-y divide-border/40">
        {items.map((v) => {
          const on = !excluded.has(v)
          return (
            <li key={v} className="flex items-center gap-2 py-1.5">
              <button
                type="button"
                aria-checked={on}
                role="checkbox"
                onClick={() =>
                  setExcluded((prev) => {
                    const next = new Set(prev)
                    if (next.has(v)) next.delete(v)
                    else next.add(v)
                    return next
                  })
                }
                className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                  on ? 'border-primary bg-primary text-white' : 'border-border bg-surface'
                }`}
                style={{ width: 18, height: 18 }}
              >
                {on && <span className="text-xs leading-none">✓</span>}
              </button>
              <span className={`min-w-0 flex-1 text-sm leading-5 ${on ? 'text-text-primary' : 'text-text-tertiary line-through'}`}>{v}</span>
            </li>
          )
        })}
      </ul>
      <div className="mt-1.5 flex items-center justify-end border-t border-border/40 pt-2">
        <button
          type="button"
          onClick={confirmSelected}
          disabled={busy || selected.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-success px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : null}
          确认勾选的 {selected.length} 条
        </button>
      </div>
    </div>
  )
}

/** 已自动录入批行（#42）：N 条诉求/竞品 = 1 批 1 行，按批撤销（展开可挑单条保留） */
function GroupAutoRow({ item }: { item: PendingItem }) {
  const resolve = useResolveItem()
  const items = groupItemsOf(item)
  const [keep, setKeep] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState(false)

  const revokeBatch = () =>
    resolve.mutate({
      id: item.id,
      action: 'revoke',
      modifiedData: keep.size > 0 ? { items: [...keep] } : undefined,
    })

  return (
    <div className="rounded-lg bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-1 text-left text-xs text-text-secondary"
        >
          <ChevronDown size={12} className={`shrink-0 text-text-tertiary transition-transform ${expanded ? '' : '-rotate-90'}`} />
          <span className="mr-1.5 shrink-0 rounded-full bg-text-tertiary/10 px-1.5 py-0.5 text-[10px] text-text-tertiary">
            {typeLabelOf(item.itemType)}
          </span>
          <span className="truncate">已自动录入 {items.length} 条</span>
        </button>
        <button
          onClick={revokeBatch}
          disabled={resolve.isPending}
          title={keep.size > 0 ? `撤销其余 ${items.length - keep.size} 条，勾选的保留` : '整批从档案中撤掉'}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-tertiary hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        >
          {resolve.isPending ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
          {keep.size > 0 ? `撤销其余 ${items.length - keep.size} 条` : '撤销本批'}
        </button>
      </div>
      {expanded && (
        <ul className="mt-1.5 space-y-1 border-t border-border/40 pt-1.5">
          {items.map((v) => {
            const kept = keep.has(v)
            return (
              <li key={v} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-checked={kept}
                  role="checkbox"
                  title="勾选 = 撤销本批时保留这条"
                  onClick={() =>
                    setKeep((prev) => {
                      const next = new Set(prev)
                      if (next.has(v)) next.delete(v)
                      else next.add(v)
                      return next
                    })
                  }
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    kept ? 'border-success bg-success text-white' : 'border-border text-transparent'
                  }`}
                >
                  <span className="text-[10px] leading-none">✓</span>
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{v}</span>
                <span className="shrink-0 text-[10px] text-text-tertiary">{kept ? '保留' : '将撤销'}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const GUIDE_KEY = 'confirmations-guide-dismissed'

/** 页面引导卡：说清"这个页面是干什么的、你要做什么"（可关闭，本地记忆） */
function GuideCard() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(GUIDE_KEY) === '1')
  if (dismissed) return null
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" />
          <div className="text-xs leading-5 text-text-secondary">
            <p className="text-sm font-medium text-text-primary">这个页面只需要你做一件事</p>
            <p className="mt-1">
              每次拜访后，AI 会把重要信息整理成一张<strong className="text-text-primary">核对清单</strong>。
              跟进动作会打成一个<strong className="text-text-primary">任务包</strong>（一个主线任务 + 步骤清单），
              需要独立跟踪的步骤点「单开」。你扫一遍：<strong className="text-success">不对的勾掉</strong>，
              然后点「确认」，一次搞定；要改内容就点「逐条编辑」。
            </p>
            <p className="mt-1 text-text-tertiary">
              客户诉求、竞品提及这类小信息 AI 会直接记进档案（下方「已自动录入」），发现记错了点「撤销」即可，不用你逐条确认。
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.setItem(GUIDE_KEY, '1')
            setDismissed(true)
          }}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-text-tertiary hover:bg-surface-elevated"
        >
          知道了
        </button>
      </div>
    </div>
  )
}

/** 已自动录入区：低风险类型（诉求/竞品）直接生效，错了可撤销 */
function AutoAppliedRow({ item }: { item: PendingItem }) {
  const resolve = useResolveItem()
  const content = String(item.itemData?.content || '')
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2">
      <p className="min-w-0 text-xs text-text-secondary">
        <span className="mr-1.5 rounded-full bg-text-tertiary/10 px-1.5 py-0.5 text-[10px] text-text-tertiary">
          {ITEM_TYPE_LABELS[item.itemType] || item.itemType}
        </span>
        {content}
      </p>
      <button
        onClick={() => resolve.mutate({ id: item.id, action: 'revoke' })}
        disabled={resolve.isPending}
        title="记错了？从档案中撤掉这条"
        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-tertiary hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      >
        {resolve.isPending ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
        撤销
      </button>
    </div>
  )
}

/** 一张确认单 = 一个 项目/线索/客户 维度；单内按拜访分块 */
function ConfirmationSheet({
  group,
  autoItems,
  defaultOpen,
  highlighted,
}: {
  group: EntityGroup
  autoItems: PendingItem[]
  defaultOpen: boolean
  highlighted: boolean
}) {
  const [open, setOpen] = useState(defaultOpen || highlighted)
  const ref = useRef<HTMLElement>(null)
  const blocks = groupVisitBlocks(group.items)

  // P1 深链：?id= 定位到目标确认单，展开并滚动到位
  useEffect(() => {
    if (highlighted) {
      setOpen(true)
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [highlighted])

  return (
    <section ref={ref} className={`rounded-xl border bg-surface ${highlighted ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <ChevronDown
          size={16}
          className={`shrink-0 text-text-tertiary transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <FileText size={16} className="shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text-primary">
            <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {entityKindLabel(group.kind)}
            </span>
            {group.title}
            {group.items.length > 0 && (
              <span className="ml-2 text-xs font-normal text-warning">{group.items.length} 项待你判断</span>
            )}
            {group.items.length === 0 && autoItems.length > 0 && (
              <span className="ml-2 text-xs font-normal text-text-tertiary">仅自动录入</span>
            )}
          </h3>
          {group.subtitle && <p className="mt-0.5 truncate text-xs text-text-tertiary">{group.subtitle}</p>}
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 px-4 py-3">
          {blocks.map((block) => {
            // #42 归类确认：任务包 / 类级条目从核对卡里拆出来单独渲染（VisitReviewCard 保留逐条视图给旧单条）
            const packageItems = block.items.filter((i) => i.itemType === 'task_package')
            const groupItems = block.items.filter(
              (i) => i.itemType === 'pain_points_group' || i.itemType === 'competitors_group',
            )
            const rest = block.items.filter(
              (i) => i.itemType !== 'task_package' && i.itemType !== 'pain_points_group' && i.itemType !== 'competitors_group',
            )
            return (
              <div key={block.visitId || 'other'} className="space-y-2">
                {block.subtitle && <p className="text-xs text-text-tertiary">{block.subtitle}</p>}
                {packageItems.map((item) => (
                  <TaskPackageCard key={item.id} item={item} />
                ))}
                {groupItems.map((item) => (
                  <GroupItemsCard key={item.id} item={item} />
                ))}
                {rest.length > 0 && <VisitReviewCard items={rest} />}
              </div>
            )
          })}

          {autoItems.length > 0 && (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <Zap size={13} className="text-text-tertiary" />
                已自动录入（{autoItems.length}）
                <span className="font-normal text-text-tertiary">诉求/竞品类小信息，错了可按批撤销</span>
              </h4>
              <div className="space-y-1">
                {autoItems.map((item) =>
                  item.itemType === 'pain_points_group' || item.itemType === 'competitors_group' ? (
                    <GroupAutoRow key={item.id} item={item} />
                  ) : (
                    <AutoAppliedRow key={item.id} item={item} />
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default function Confirmations() {
  const { data: allItems, isLoading, error, refetch } = usePendingItems({ status: 'pending,auto' })
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightId, setHighlightId] = useState<string | undefined>(undefined)

  // P1 深链：/confirmations?id=<pendingItemId> 高亮定位对应确认单
  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      setHighlightId(id)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const pendingItems = (allItems || []).filter((i) => i.status === 'pending')
  const autoItems = (allItems || []).filter((i) => i.status === 'auto')

  // 待判断项与自动录入项分别按实体聚合，再按实体合并展示
  const pendingGroups = groupByEntity(pendingItems)
  const autoGroups = groupByEntity(autoItems)
  const autoByKey = new Map(autoGroups.map((g) => [g.key, g.items]))
  const sheetKeys = [...new Set([...pendingGroups.map((g) => g.key), ...autoGroups.map((g) => g.key)])]
  const sheets = sheetKeys.map((key) => {
    const pg = pendingGroups.find((g) => g.key === key)
    const ag = autoGroups.find((g) => g.key === key)
    return { group: pg || ag!, autoItems: pg ? autoByKey.get(key) || [] : ag!.items }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">待确认收件箱</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            扫一遍清单，勾掉不对的，点一次确认就处理完了
          </p>
        </div>
        {pendingItems.length > 0 && (
          <span className="rounded-full bg-warning/10 px-3 py-1 text-sm font-medium text-warning">
            {pendingGroups.length} 单 · {pendingItems.length} 项待你判断
          </span>
        )}
      </div>

      <GuideCard />

      {isLoading && <LoadingState />}
      {error && <ErrorState message={(error as Error).message} onRetry={() => refetch()} />}

      {!isLoading && !error && sheets.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="收件箱已清空"
          description="AI 提取的信息都已处理完毕"
        />
      )}

      {!isLoading && !error && sheets.map(({ group, autoItems: autos }, idx) => (
        <ConfirmationSheet
          key={group.key}
          group={group}
          autoItems={autos}
          defaultOpen={idx === 0}
          highlighted={!!highlightId && (group.items.some((i) => i.id === highlightId) || autos.some((i) => i.id === highlightId))}
        />
      ))}

      {!isLoading && !error && pendingItems.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <X size={12} />
          未勾选的条目会留在收件箱；驳回不会删除任何已有数据。
        </p>
      )}
    </div>
  )
}
