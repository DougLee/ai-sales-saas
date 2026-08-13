import { History, Loader2 } from 'lucide-react'
import { useActivities, type ActivityEvent } from '../../hooks/use-activities.js'
import { ActivityItem } from './ActivityItem.js'

interface ActivityFeedProps {
  entityType: 'customer' | 'project'
  entityId?: string
  title?: string
  showProject?: boolean
}

export function ActivityFeed({
  entityType,
  entityId,
  title = '动态',
  showProject = false,
}: ActivityFeedProps) {
  const { data, isLoading, isError } = useActivities(entityType, entityId)
  const items = data?.items || []

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
        <History size={14} /> {title}
      </h4>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      )}

      {isError && (
        <p className="py-4 text-center text-xs text-danger">加载动态失败，请稍后重试</p>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <p className="text-xs text-text-tertiary">暂无动态记录</p>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="space-y-0">
          {items.map((event: ActivityEvent) => (
            <ActivityItem key={event.id} event={event} showProject={showProject} />
          ))}
        </div>
      )}
    </div>
  )
}
