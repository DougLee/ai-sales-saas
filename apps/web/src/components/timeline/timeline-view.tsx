import { useEffect, useMemo, useRef, useState } from 'react'
import { GripHorizontal, History, Loader2 } from 'lucide-react'
import { useActivities, type ActivityEvent } from '../../hooks/use-activities.js'
import { ActivityItem } from '../activity/ActivityItem.js'
import {
  CATEGORY_LABELS,
  filterEventsByCategory,
  presentCategories,
  shouldShowFilter,
  type EventCategory,
} from './timeline-utils.js'

/**
 * 客户/项目时间轴视图（V6.1 §九 Phase 5）
 *
 * - 滚动加载（分页累加）
 * - 按事件类别筛选
 * - 待确认事件不显示：/activities 接口服务端已按 factStatus='confirmed' 过滤，
 *   前端不传 includePending（确认态隔离红线）
 */

const PAGE_SIZE = 20
/** 默认高度上限（事件少时卡片随内容紧凑，事件多时才顶到上限） */
const DEFAULT_MAX_HEIGHT = 560
const MIN_HEIGHT = 160

/** 读取用户拖过的高度偏好；未拖过返回 null（走默认紧凑行为） */
function savedHeight(): number | null {
  try {
    const v = Number(localStorage.getItem('timeline-height'))
    return v >= MIN_HEIGHT ? v : null
  } catch {
    return null
  }
}

export function TimelineView({
  entityType,
  entityId,
  title = '时间轴',
  showProject,
}: {
  entityType: 'customer' | 'project'
  entityId?: string
  title?: string
  showProject?: boolean
}) {
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState<EventCategory>('all')
  // 分页累加：已加载的页缓存本地，筛选只作用于已加载数据
  const [loaded, setLoaded] = useState<ActivityEvent[]>([])
  const [loadedUpTo, setLoadedUpTo] = useState(0)

  const { data, isLoading, isError, refetch } = useActivities(entityType, entityId, page, PAGE_SIZE)

  // 新页到达时合并（去重防重）
  useEffect(() => {
    if (!data || data.page <= loadedUpTo) return
    setLoaded((prev) => {
      const seen = new Set(prev.map((e) => e.id))
      return [...prev, ...data.items.filter((e) => !seen.has(e.id))]
    })
    setLoadedUpTo(data.page)
  }, [data, loadedUpTo])

  // 切换实体时重置
  useEffect(() => {
    setLoaded([])
    setLoadedUpTo(0)
    setPage(1)
  }, [entityType, entityId])

  const total = data?.total ?? 0
  const filtered = useMemo(() => filterEventsByCategory(loaded, category), [loaded, category])
  const hasMore = loaded.length < total

  // 筛选 chips 只给真实出现的类别；只有一个类别时整条筛选栏不显示
  const chips = useMemo(() => presentCategories(loaded), [loaded])
  const showFilter = shouldShowFilter(loaded)

  // 已选类别随数据变化消失（如切换实体）时回退到全部，避免被空筛选困住
  useEffect(() => {
    if (category !== 'all' && !chips.includes(category)) setCategory('all')
  }, [category, chips])

  // P2：类别筛选不能只筛已加载页——选了具体类别且还有未加载页时自动续拉，
  // 直到该类别凑够一屏或没有更多数据
  useEffect(() => {
    if (category === 'all' || !hasMore || isLoading) return
    if (filtered.length >= PAGE_SIZE) return
    setPage((p) => p + 1)
  }, [category, filtered.length, hasMore, isLoading])

  // 当前筛选下已加载为空但还有未加载页 → 自动拉下一页
  const canLoadMore = hasMore && !isLoading

  // 拖拽调高：null = 未拖过（紧凑模式，max-h 560）；拖过则固定为用户高度并持久化
  const [height, setHeight] = useState<number | null>(savedHeight)
  const listRef = useRef<HTMLDivElement>(null)

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = listRef.current?.offsetHeight ?? 300
    const maxH = Math.round(window.innerHeight * 0.8)
    let latest = startH
    const onMove = (ev: PointerEvent) => {
      latest = Math.min(Math.max(startH + ev.clientY - startY, MIN_HEIGHT), maxH)
      setHeight(latest)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      try {
        localStorage.setItem('timeline-height', String(Math.round(latest)))
      } catch { /* 隐私模式静默降级 */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
          <History size={14} /> {title}
          <span className="text-xs text-text-tertiary">({total})</span>
        </h4>
      </div>

      {/* 类别筛选：只在出现多个类别时显示 */}
      {showFilter && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                category === c
                  ? 'bg-primary text-white'
                  : 'bg-surface-elevated text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      )}

      {isLoading && loaded.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      )}

      {isError && (
        <div className="py-4 text-center">
          <p className="text-xs text-danger">加载时间轴失败</p>
          <button onClick={() => refetch()} className="mt-2 text-xs text-primary hover:underline">
            重试
          </button>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && loaded.length > 0 && (
        <p className="py-4 text-center text-xs text-text-tertiary">该类别下暂无事件</p>
      )}
      {!isLoading && !isError && loaded.length === 0 && (
        <p className="text-xs text-text-tertiary">暂无动态记录</p>
      )}

      {filtered.length > 0 && (
        <div
          ref={listRef}
          className="space-y-0 overflow-y-auto pr-1"
          style={height ? { height } : { maxHeight: DEFAULT_MAX_HEIGHT }}
        >
          {filtered.map((event) => (
            <ActivityItem key={event.id} event={event} showProject={showProject ?? entityType === 'customer'} />
          ))}
        </div>
      )}

      {canLoadMore && (
        <button
          onClick={() => setPage((p) => p + 1)}
          className="mt-3 w-full rounded-lg border border-border py-1.5 text-xs text-text-secondary hover:bg-surface-elevated"
        >
          加载更多（已加载 {loaded.length}/{total}）
        </button>
      )}
      {isLoading && loaded.length > 0 && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-text-tertiary">
          <Loader2 size={12} className="animate-spin" /> 加载中…
        </p>
      )}

      {/* 底部拖拽手柄：上下拖动调整时间轴高度，记住偏好 */}
      {filtered.length > 0 && (
        <div
          onPointerDown={startResize}
          className="-mb-2 mt-1 flex h-5 cursor-row-resize touch-none select-none items-center justify-center text-text-tertiary/60 transition-colors hover:text-text-secondary"
          title="拖动调整时间轴高度"
        >
          <GripHorizontal size={14} />
        </div>
      )}
    </div>
  )
}
