import {
  Rocket,
  ChevronRight,
  XCircle,
  HeartPulse,
  Calendar,
  Flag,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Users,
  UserPlus,
  Phone,
  Sparkles,
  Bot,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { ActivityEvent } from '../../hooks/use-activities.js'

interface ActivityMeta {
  icon: LucideIcon
  iconClass: string
  title: string
  description?: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function getActivityMeta(event: ActivityEvent): ActivityMeta {
  const data = event.eventData || {}

  switch (event.eventType) {
    case 'COMPANY_CREATED':
      return {
        icon: Building2,
        iconClass: 'bg-primary/10 text-primary',
        title: '创建客户',
        description: data.name as string,
      }
    case 'COMPANY_ASSIGNED':
      return {
        icon: UserPlus,
        iconClass: 'bg-success/10 text-success',
        title: '认领客户',
      }
    case 'COMPANY_OWNER_CHANGED':
      return {
        icon: Users,
        iconClass: 'bg-warning/10 text-warning',
        title: '客户负责人变更',
      }

    case 'CONTACT_CREATED':
      return {
        icon: UserPlus,
        iconClass: 'bg-primary/10 text-primary',
        title: '新增联系人',
        description: [data.name, data.position].filter(Boolean).join(' · '),
      }
    case 'CONTACT_UPDATED':
      return {
        icon: Users,
        iconClass: 'bg-text-tertiary/10 text-text-tertiary',
        title: '更新联系人',
        description: data.name as string,
      }

    case 'LEAD_CREATED':
      return {
        icon: UserPlus,
        iconClass: 'bg-primary/10 text-primary',
        title: '新建线索',
        description: data.name as string,
      }
    case 'LEAD_FOLLOW_UP_CREATED':
      return {
        icon: Phone,
        iconClass: 'bg-primary/10 text-primary',
        title: '线索跟进',
        description: data.content as string,
      }
    case 'LEAD_CONVERTED':
      return {
        icon: CheckCircle2,
        iconClass: 'bg-success/10 text-success',
        title: '线索转化',
        description: data.projectId ? '已转化为商机' : '已转化为客户',
      }
    case 'LEAD_LOST':
      return {
        icon: XCircle,
        iconClass: 'bg-danger/10 text-danger',
        title: '线索流失',
        description: data.reason as string,
      }

    case 'PROJECT_CREATED':
      return {
        icon: Rocket,
        iconClass: 'bg-primary/10 text-primary',
        title: '创建商机',
        description: data.name as string,
      }
    case 'MILESTONE_ADVANCED':
      return {
        icon: ChevronRight,
        iconClass: 'bg-blue-500/10 text-blue-500',
        title: '里程碑推进',
        description: event.eventSubtype || `M${data.from} → M${data.to}`,
      }
    case 'MILESTONE_GATE_PASSED':
      return {
        icon: CheckCircle2,
        iconClass: 'bg-success/10 text-success',
        title: '通过里程碑校验',
        description: event.eventSubtype,
      }
    case 'PROJECT_CLOSED':
      return {
        icon: XCircle,
        iconClass: 'bg-danger/10 text-danger',
        title: '商机关闭',
        description: data.name as string,
      }
    case 'HEALTH_SCORE_CHANGED':
      return {
        icon: HeartPulse,
        iconClass: 'bg-warning/10 text-warning',
        title: '健康度更新',
        description: `健康度 ${data.healthScore}`,
      }
    case 'WIN_PROBABILITY_CHANGED':
      return {
        icon: HeartPulse,
        iconClass: 'bg-primary/10 text-primary',
        title: '赢单概率更新',
        description: `赢单概率 ${data.winProbability}%`,
      }
    case 'PROJECT_STALE_MARKED':
      return {
        icon: AlertTriangle,
        iconClass: 'bg-danger/10 text-danger',
        title: '项目停滞',
        description: data.reason as string,
      }
    case 'PROJECT_STALE_RECOVERED':
      return {
        icon: CheckCircle2,
        iconClass: 'bg-success/10 text-success',
        title: '项目停滞恢复',
      }
    case 'PROJECT_WAITING_MARKED':
      return {
        icon: Calendar,
        iconClass: 'bg-warning/10 text-warning',
        title: '标记等待客户',
        description: (data.waitingLabel as string) || (data.waitingStatus as string),
      }
    case 'PROJECT_WAITING_CLEARED':
      return {
        icon: CheckCircle2,
        iconClass: 'bg-success/10 text-success',
        title: '解除等待，恢复跟进',
        description: data.note as string,
      }

    case 'VISIT_CREATED':
      return {
        icon: Calendar,
        iconClass: 'bg-primary/10 text-primary',
        title: '创建拜访计划',
        description: data.visitTime ? formatDateShort(data.visitTime as string) : undefined,
      }
    case 'VISIT_COMPLETED':
      return {
        icon: CheckCircle2,
        iconClass: 'bg-success/10 text-success',
        title: '完成拜访',
        description: data.summary as string,
      }
    case 'VISIT_AI_ANALYZED':
      return {
        icon: Sparkles,
        iconClass: 'bg-purple-500/10 text-purple-500',
        title: 'AI 完成拜访分析',
        description: data.summary as string,
      }
    case 'VISIT_CONFIRMED':
      return {
        icon: CheckCircle2,
        iconClass: 'bg-success/10 text-success',
        title: '拜访信息已确认',
        description:
          data.confirmedCount != null
            ? `确认 ${data.confirmedCount} 项${data.rejectedCount ? `，驳回 ${data.rejectedCount} 项` : ''}`
            : undefined,
      }
    case 'VISIT_MILESTONE_CHANGED':
      return {
        icon: ChevronRight,
        iconClass: 'bg-blue-500/10 text-blue-500',
        title: '拜访触发里程碑变更',
        description: event.eventSubtype,
      }

    case 'TASK_CREATED':
      return {
        icon: Flag,
        iconClass: 'bg-primary/10 text-primary',
        title: '创建待办',
        description: data.title as string,
      }
    case 'TASK_COMPLETED':
      return {
        icon: CheckCircle2,
        iconClass: 'bg-success/10 text-success',
        title: '完成待办',
        description: data.title as string,
      }
    case 'TASK_OVERDUE':
      return {
        icon: AlertTriangle,
        iconClass: 'bg-danger/10 text-danger',
        title: '待办逾期',
        description: `${data.title} · 已逾期 ${data.daysOverdue} 天`,
      }
    case 'TASK_DEADLINE_CHANGED':
      return {
        icon: Calendar,
        iconClass: 'bg-warning/10 text-warning',
        title: '待办截止时间变更',
        description: data.title as string,
      }

    case 'AI_ANALYSIS_COMPLETED':
      return {
        icon: Sparkles,
        iconClass: 'bg-purple-500/10 text-purple-500',
        title: 'AI 分析完成',
        description: data.summary as string,
      }
    case 'SYSTEM_STALE_SCAN':
      return {
        icon: Settings,
        iconClass: 'bg-text-tertiary/10 text-text-tertiary',
        title: '系统自动扫描',
        description: data.result as string,
      }

    default:
      return {
        icon: Bot,
        iconClass: 'bg-text-tertiary/10 text-text-tertiary',
        title: event.sourceLabel || event.eventType,
      }
  }
}

export function ActivityItem({ event, showProject = false }: { event: ActivityEvent; showProject?: boolean }) {
  const meta = getActivityMeta(event)
  const Icon = meta.icon

  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      <div className="absolute left-[11px] top-6 h-full w-px bg-border last:hidden" />
      <div className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.iconClass}`}>
        <Icon size={12} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-text-primary">{meta.title}</span>
          <span className="shrink-0 text-[10px] text-text-tertiary">{formatDate(event.eventTime)}</span>
        </div>
        {meta.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{meta.description}</p>
        )}
        {showProject && event.project && (
          <p className="mt-0.5 text-xs text-text-tertiary">关联商机：{event.project.name}</p>
        )}
      </div>
    </div>
  )
}
