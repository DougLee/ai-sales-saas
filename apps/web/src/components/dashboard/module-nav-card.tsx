import { useNavigate } from 'react-router-dom'
import { FileText, Briefcase, UserRound, ClipboardList, ArrowRight } from 'lucide-react'

export interface ModuleNavCardProps {
  leadCount: number
  projectCount: number
  taskCount: number
  visitCount: number
}

const modules = [
  {
    key: 'leads',
    title: '线索',
    path: '/leads',
    icon: FileText,
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/20',
    countKey: 'leadCount' as const,
  },
  {
    key: 'projects',
    title: '商机',
    path: '/projects',
    icon: Briefcase,
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/20',
    countKey: 'projectCount' as const,
  },
  {
    key: 'visits',
    title: '拜访',
    path: '/visits',
    icon: UserRound,
    color: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/20',
    countKey: 'visitCount' as const,
  },
  {
    key: 'tasks',
    title: '任务',
    path: '/tasks',
    icon: ClipboardList,
    color: 'text-text-secondary',
    bg: 'bg-surface-elevated',
    border: 'border-border',
    countKey: 'taskCount' as const,
  },
]

export function ModuleNavCard({ leadCount, projectCount, taskCount, visitCount }: ModuleNavCardProps) {
  const navigate = useNavigate()
  const countMap = { leadCount, projectCount, taskCount, visitCount }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-text-secondary">作战模块</h3>
      <div className="grid grid-cols-2 gap-3">
        {modules.map((m) => {
          const Icon = m.icon
          const count = countMap[m.countKey]
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => navigate(m.path)}
              className={`relative flex items-center gap-3 rounded-xl border ${m.border} ${m.bg} p-3 text-left transition-all hover:border-primary/30 hover:shadow-glow`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.bg} ${m.color}`}
              >
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{m.title}</p>
                <p className="text-xs text-text-tertiary">{count} 项待处理</p>
              </div>
              <ArrowRight size={14} className="shrink-0 text-text-tertiary" />
              {count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
