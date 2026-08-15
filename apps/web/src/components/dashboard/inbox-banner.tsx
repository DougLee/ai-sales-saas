import { Inbox, ArrowRight, CheckCircle2 } from 'lucide-react'
import { ITEM_TYPE_LABELS } from '../../hooks/use-confirmations.js'

/**
 * 侧栏收件箱入口横幅（issue #34：侧栏不再平铺收件箱列表，收成一行入口）
 * 有货：高亮横幅（件数 + 最紧一件预览）；无货：安静的完成态。
 */

interface InboxBannerProps {
  count: number
  /** 最紧一件的预览文案（类型 + 摘要） */
  preview?: { typeLabel: string; text: string } | null
  isLoading?: boolean
  onClick: () => void
}

export function InboxBanner({ count, preview, isLoading, onClick }: InboxBannerProps) {
  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-2xl bg-surface-elevated" />
  }

  if (count === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
        <CheckCircle2 size={16} className="shrink-0 text-success" />
        <div>
          <p className="text-sm font-medium text-text-secondary">收件箱已清空</p>
          <p className="text-xs text-text-tertiary">AI 提取的信息均已确认</p>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 text-left transition-all hover:border-warning/50 hover:bg-warning/10"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
        <Inbox size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-warning">{count} 件待确认</span>
          <span className="text-[11px] text-text-tertiary">过堂后落库</span>
        </span>
        {preview && (
          <span className="mt-0.5 block truncate text-xs text-text-secondary">
            <span className="mr-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              {preview.typeLabel}
            </span>
            {preview.text}
          </span>
        )}
      </span>
      <ArrowRight size={15} className="shrink-0 text-warning transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

/** 预览文案工厂：最紧一件（列表第一条） */
export function buildInboxPreview(item: {
  itemType: string
  headline: string
}): { typeLabel: string; text: string } {
  return { typeLabel: ITEM_TYPE_LABELS[item.itemType] || item.itemType, text: item.headline }
}
