import { CalendarDays, ListChecks, RotateCcw, Unlink, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils.js'
import type { VisitFilterKey, VisitStats } from './visit-funnel.utils.js'

/**
 * 拜访统计条 = 可点筛选器（issue #41 A1）：
 * 4 个数字不是装饰，点击即过滤列表；再点一次取消。
 */

type StatTileKey = Exclude<VisitFilterKey, 'all'>

interface TileConfig {
  key: StatTileKey
  label: string
  hint: string
  icon: LucideIcon
  numberCls: string
  iconCls: string
}

const TILES: readonly TileConfig[] = [
  {
    key: 'week',
    label: '本周拜访',
    hint: '本周（周一起）的拜访数',
    icon: CalendarDays,
    numberCls: 'text-primary',
    iconCls: 'bg-primary/10 text-primary',
  },
  {
    key: 'reviewing',
    label: '待复盘',
    hint: 'workflowStage=REVIEWING，价值未兑现',
    icon: RotateCcw,
    numberCls: 'text-warning',
    iconCls: 'bg-warning/10 text-warning',
  },
  {
    key: 'hasNext',
    label: '已产生任务',
    hint: '已留下一步行动的拜访（nextAction）',
    icon: ListChecks,
    numberCls: 'text-success',
    iconCls: 'bg-success/10 text-success',
  },
  {
    key: 'noCompany',
    label: '未关联客户',
    hint: '没挂客户的拜访，证据链断点',
    icon: Unlink,
    numberCls: 'text-danger',
    iconCls: 'bg-danger/10 text-danger',
  },
]

export function VisitStatsBar({
  stats,
  active,
  onChange,
}: {
  stats: VisitStats
  active: VisitFilterKey
  onChange: (key: VisitFilterKey) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="visit-stats-bar">
      {TILES.map((tile) => {
        const isActive = active === tile.key
        const Icon = tile.icon
        return (
          <button
            key={tile.key}
            type="button"
            title={tile.hint}
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? 'all' : tile.key)}
            className={cn(
              'flex items-center gap-3 rounded-card border bg-surface px-4 py-3 text-left transition-all hover:border-primary/40 hover:shadow-lift',
              isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border',
            )}
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-inner',
                tile.iconCls,
              )}
            >
              <Icon size={16} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className={cn('block text-xl font-semibold leading-none tabular-nums', tile.numberCls)}>
                {stats[tile.key]}
              </span>
              <span className="mt-1.5 block truncate text-xs text-text-tertiary">{tile.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
