import { cn } from '../../lib/utils.js'
import {
  SOURCE_PARTITIONS,
  type SourcePartitionCounts,
  type TaskSourceFilter,
} from './task-partitions.utils.js'

/**
 * 来源分区页签（issue #41 B1）：手动创建 / AI 提取 / 跟进提醒 / 系统巡检。
 * 与状态页签（进行中/已完成/…）正交，点击过滤当前视图。
 */

export function TaskSourceTabs({
  value,
  counts,
  onChange,
}: {
  value: TaskSourceFilter
  counts: SourcePartitionCounts
  onChange: (key: TaskSourceFilter) => void
}) {
  const showOther = counts.other > 0
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border" role="tablist" aria-label="按来源分区">
      <button
        role="tab"
        aria-selected={value === 'all'}
        onClick={() => onChange('all')}
        className={cn(
          '-mb-px border-b-2 px-3.5 py-2 text-sm transition-colors',
          value === 'all'
            ? 'border-primary font-medium text-primary'
            : 'border-transparent text-text-secondary hover:text-text-primary',
        )}
      >
        全部
      </button>
      {SOURCE_PARTITIONS.map((p) => (
        <button
          key={p.key}
          role="tab"
          aria-selected={value === p.key}
          title={p.hint}
          onClick={() => onChange(p.key)}
          className={cn(
            '-mb-px border-b-2 px-3.5 py-2 text-sm transition-colors',
            value === p.key
              ? 'border-primary font-medium text-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary',
          )}
        >
          {p.label}
          <span className="ml-1.5 rounded-full bg-surface-elevated px-1.5 py-0.5 text-[11px] tabular-nums text-text-tertiary">
            {counts[p.key]}
          </span>
        </button>
      ))}
      {showOther && (
        <button
          role="tab"
          aria-selected={value === 'other'}
          onClick={() => onChange('other')}
          className={cn(
            '-mb-px border-b-2 px-3.5 py-2 text-sm transition-colors',
            value === 'other'
              ? 'border-primary font-medium text-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary',
          )}
        >
          其他
          <span className="ml-1.5 rounded-full bg-surface-elevated px-1.5 py-0.5 text-[11px] tabular-nums text-text-tertiary">
            {counts.other}
          </span>
        </button>
      )}
    </div>
  )
}
