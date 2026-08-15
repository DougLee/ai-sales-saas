import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * 统一页签（审计 #18：三页三种页签样式收敛为下划线式，补 ARIA tablist 语义）
 */

export interface TabItem {
  key: string
  label: string
  /** 计数徽章；undefined 不显示 */
  count?: number | string
  /** 突出样式（如线索页「可转化」绿字） */
  hot?: boolean
}

export function ViewTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly TabItem[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border" role="tablist">
      {tabs.map((t) => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm transition-colors ${
              active
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                  t.hot && (typeof t.count === 'number' ? t.count > 0 : true)
                    ? 'bg-success/15 font-bold text-success'
                    : active
                      ? 'bg-primary/10 text-primary'
                      : 'bg-surface-elevated text-text-tertiary'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 统一分页（审计 #18：customers 页码式 / leads 上下页 / projects 无 → 一套）
 */
export function Pagination({
  page,
  totalPages,
  onChange,
  totalLabel,
  pageSize,
  onPageSizeChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
  totalLabel?: string
  pageSize?: number
  onPageSizeChange?: (size: number) => void
}) {
  if (totalPages <= 1 && !totalLabel) return null
  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-xs text-text-secondary">
      {totalLabel && <span>{totalLabel}</span>}
      {pageSize && onPageSizeChange && (
        <>
          <span>每页</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="每页条数"
            className="h-7 rounded-md border border-border bg-surface px-1 text-xs outline-none focus:border-primary cursor-pointer"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(page - 1, 1))}
          disabled={page <= 1}
          aria-label="上一页"
          className="rounded-md border border-border bg-surface p-1 transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
        >
          <ChevronLeft size={12} />
        </button>
        <span className="px-1">{page} / {Math.max(totalPages, 1)}</span>
        <button
          onClick={() => onChange(Math.min(page + 1, totalPages))}
          disabled={page >= totalPages}
          aria-label="下一页"
          className="rounded-md border border-border bg-surface p-1 transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
        >
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  )
}
