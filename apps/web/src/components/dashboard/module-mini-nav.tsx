import { useNavigate } from 'react-router-dom'
import { FileText, Briefcase, UserRound, ClipboardList, ArrowRight } from 'lucide-react'
import { useHasRole } from '../../hooks/use-permission.js'

/**
 * 侧栏底部模块四宫格（issue #34：原整块模块导航卡收拢为小四宫格）
 */

interface ModuleMiniNavProps {
  leadCount: number
  projectCount: number
  taskCount: number
  visitCount: number
}

const modules = [
  { key: 'leads', title: '线索', path: '/leads', icon: FileText, countKey: 'leadCount' as const },
  { key: 'projects', title: '商机', path: '/projects', icon: Briefcase, countKey: 'projectCount' as const },
  { key: 'visits', title: '拜访', path: '/visits', icon: UserRound, countKey: 'visitCount' as const },
  { key: 'tasks', title: '任务', path: '/tasks', icon: ClipboardList, countKey: 'taskCount' as const },
]

export function ModuleMiniNav({ leadCount, projectCount, taskCount, visitCount }: ModuleMiniNavProps) {
  const navigate = useNavigate()
  // 与模块页一致的 SALES_TEAM 守卫，VIEWER 不给入口
  const canSales = useHasRole('TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD', 'SALES')
  if (!canSales) return null

  const countMap = { leadCount, projectCount, taskCount, visitCount }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="grid grid-cols-2 gap-2">
        {modules.map((m) => {
          const Icon = m.icon
          const count = countMap[m.countKey]
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => navigate(m.path)}
              className="group flex items-center gap-2 rounded-xl border border-border bg-surface-elevated/50 px-2.5 py-2 text-left transition-colors hover:border-primary/30"
            >
              <Icon size={14} className="shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-secondary">{m.title}</span>
              <span className="shrink-0 text-xs text-text-tertiary">{count}</span>
              <ArrowRight
                size={11}
                className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
