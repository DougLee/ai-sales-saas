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
 * 待确认收件箱（V6.2 分级信任 + 表单式确认）
 *
 * - 确认单元 = 一次拜访一张核对卡：按字段分区、逐条勾选、一次确认
 * - 低风险信息（客户诉求/竞品）自动生效，在「已自动录入」区可一键撤销
 * - 只有 任务/预算/决策链 需要人工把关
 */

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
              你扫一遍：<strong className="text-success">不对的勾掉</strong>，然后点「确认勾选」，一次搞定；
              要改内容就点「逐条编辑」。
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
          {blocks.map((block) => (
            <VisitReviewCard key={block.visitId || 'other'} items={block.items} subtitle={block.subtitle} />
          ))}

          {autoItems.length > 0 && (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <Zap size={13} className="text-text-tertiary" />
                已自动录入（{autoItems.length}）
                <span className="font-normal text-text-tertiary">诉求/竞品类小信息，错了可撤销</span>
              </h4>
              <div className="space-y-1">
                {autoItems.map((item) => (
                  <AutoAppliedRow key={item.id} item={item} />
                ))}
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
