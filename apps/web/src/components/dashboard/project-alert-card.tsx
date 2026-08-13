import { AlertTriangle, TrendingDown, Clock, AlertCircle, HelpCircle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Project } from '../../hooks/use-projects.js'
import { cn } from '../../lib/utils.js'

interface ProjectAlertCardProps {
  projects: {
    gateBlocked: Project[]
    stale: Project[]
    lowHealth: Project[]
    urgent: Project[]
  }
  isLoading?: boolean
  onItemClick?: (projectId: string) => void
}

const milestoneLabels = [
  '初识客户', '明确痛点', '明确需求', '明确经费',
  '明确方案', '明确价格', '协助采购', '招标确认', '投标中标',
]

const urgencyClass: Record<string, string> = {
  LOW: 'bg-success/10 text-success',
  MEDIUM: 'bg-warning/10 text-warning',
  HIGH: 'bg-danger/10 text-danger',
  CRITICAL: 'bg-danger/20 text-danger',
}

const sections = [
  { key: 'gateBlocked', title: 'Gate 推进受阻', icon: AlertCircle, reason: '条件未满足' },
  { key: 'stale', title: '项目停滞', icon: Clock, reason: '长期未更新' },
  { key: 'lowHealth', title: '健康度偏低', icon: TrendingDown, reason: '健康度 < 40' },
  { key: 'urgent', title: '紧急商机', icon: AlertTriangle, reason: '高/紧急优先级' },
] as const

function ProjectItem({ project, reason, showUrgency, onClick }: { project: Project; reason: string; showUrgency: boolean; onClick?: () => void }) {
  return (
    <div
      className="flex cursor-pointer items-center justify-between px-5 py-2.5 transition-colors hover:bg-surface-elevated/50"
      onClick={onClick}
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{project.name}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
          <span>{milestoneLabels[project.milestone]}</span>
          {project.company && <span className="truncate">{project.company.name}</span>}
          <span className="text-text-secondary">{reason}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {project.healthScore != null && (
          <span className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            project.healthScore < 40 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
          )}>
            健康度 {project.healthScore}
          </span>
        )}
        {/* 紧急商机分区的标题已表达紧急语义，条目不再重复徽章 */}
        {showUrgency && (
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', urgencyClass[project.urgency])}>
            {project.urgency === 'CRITICAL' ? '紧急' : project.urgency === 'HIGH' ? '高' : project.urgency === 'MEDIUM' ? '中' : '低'}
          </span>
        )}
      </div>
    </div>
  )
}

/** 每个分区最多展示的条数，超出收进底部链接 */
const SECTION_CAP = 3

export function ProjectAlertCard({ projects, isLoading, onItemClick }: ProjectAlertCardProps) {
  const total = sections.reduce((sum, s) => sum + projects[s.key].length, 0)
  const hiddenCount = sections.reduce(
    (sum, s) => sum + Math.max(0, projects[s.key].length - SECTION_CAP),
    0,
  )

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="h-6 w-32 animate-pulse rounded-lg bg-surface-elevated" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-elevated" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">卡住商机</h3>
          <span title="分类规则：Gate 推进受阻 = 里程碑门控条件未满足；项目停滞 = 超过14天无拜访且7天无任务更新；健康度偏低 = 健康度 < 40；紧急商机 = 紧急度 HIGH/CRITICAL">
            <HelpCircle size={14} className="cursor-help text-text-tertiary" />
          </span>
        </div>
        <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-sm font-medium text-warning">{total}</span>
      </div>
      <div className="divide-y divide-border">
        {total === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-text-tertiary">
            暂无卡住商机，推进顺利 🚀
          </div>
        ) : (
          sections.map((section) => {
            const items = projects[section.key]
            const shown = items.slice(0, SECTION_CAP)
            const hidden = items.length - shown.length
            return items.length > 0 ? (
              <div key={section.key}>
                <div className="flex items-center gap-2 bg-surface-elevated/30 px-5 py-2 text-xs font-medium text-text-secondary">
                  <section.icon size={14} />
                  {section.title}
                  <span className="ml-1 text-text-tertiary">({items.length})</span>
                </div>
                {shown.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    reason={section.reason}
                    showUrgency={section.key !== 'urgent'}
                    onClick={() => onItemClick?.(project.id)}
                  />
                ))}
                {hidden > 0 && (
                  <div className="px-5 py-2 text-xs text-text-tertiary">还有 {hidden} 个…</div>
                )}
              </div>
            ) : null
          })
        )}
        {hiddenCount > 0 && (
          <Link
            to="/projects"
            className="flex items-center justify-center gap-1 border-t border-border px-5 py-3 text-sm text-primary transition-colors hover:bg-surface-elevated/50"
          >
            还有 {hiddenCount} 个卡住商机，去商机页处理
            <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </div>
  )
}
