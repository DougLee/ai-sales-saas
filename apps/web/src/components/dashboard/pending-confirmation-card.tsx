import { Inbox, ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  usePendingItems,
  summarizeItem,
  ITEM_TYPE_LABELS,
} from '../../hooks/use-confirmations.js'

/**
 * 工作台 · 待确认区（V6.1 §十 工作台升级）
 * AI 提取产物等人工确认——确认后才会成为客户事实
 */
export function PendingConfirmationCard() {
  const navigate = useNavigate()
  const { data: items, isLoading } = usePendingItems({ status: 'pending' })
  const count = items?.length ?? 0
  const top = (items || []).slice(0, 3)

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
          <Inbox size={15} className="text-warning" />
          待确认
          {count > 0 && (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">{count}</span>
          )}
        </h3>
        {count > 0 && (
          <button
            onClick={() => navigate('/confirmations')}
            className="flex items-center gap-0.5 text-xs text-primary hover:underline"
          >
            去处理 <ArrowUpRight size={12} />
          </button>
        )}
      </div>

      {isLoading && (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-elevated" />
          ))}
        </div>
      )}

      {!isLoading && count === 0 && (
        <p className="mt-3 text-xs text-text-tertiary">收件箱已清空，AI 提取的信息都已确认</p>
      )}

      {!isLoading && top.length > 0 && (
        <div className="mt-3 space-y-2">
          {top.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate('/confirmations')}
              className="flex w-full items-center gap-2 rounded-lg bg-surface-elevated px-3 py-2 text-left hover:bg-border/50"
            >
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {ITEM_TYPE_LABELS[item.itemType] || item.itemType}
              </span>
              <span className="truncate text-xs text-text-secondary">{summarizeItem(item)}</span>
            </button>
          ))}
          {count > 3 && (
            <p className="text-center text-[11px] text-text-tertiary">还有 {count - 3} 项…</p>
          )}
        </div>
      )}
    </div>
  )
}
