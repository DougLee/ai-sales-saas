import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Target, Phone, TrendingUp, Magnet, KanbanSquare, BookOpen, Settings, HelpCircle, Building2, Inbox, Trophy, BarChart3 } from 'lucide-react'
import { useHasRole } from '../../hooks/use-permission.js'
import type { UserRole } from '@ai-sales/shared'

/**
 * AI 原生工作流导航
 * 从「模块导航」改为「销售阶段导航」，让业务流程显性化
 */
const navItems: { id: string; label: string; icon: typeof Home; path: string; roles?: UserRole[] }[] = [
  { id: 'workbench', label: '今日作战', icon: Home, path: '/' },
  { id: 'target-customers', label: '目标客户', icon: Target, path: '/customers?status=target', roles: ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD', 'SALES'] },
  { id: 'customers', label: '客户管理', icon: Building2, path: '/customers', roles: ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD', 'SALES'] },
  { id: 'visits', label: '拜访中心', icon: Phone, path: '/visits', roles: ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD', 'SALES'] },
  { id: 'confirmations', label: '待确认', icon: Inbox, path: '/confirmations', roles: ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD', 'SALES'] },
  { id: 'leads', label: '线索管理', icon: Magnet, path: '/leads', roles: ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD', 'SALES'] },
  { id: 'projects', label: '推进商机', icon: TrendingUp, path: '/projects', roles: ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD', 'SALES'] },
  { id: 'pipeline', label: '销售看板', icon: KanbanSquare, path: '/pipeline', roles: ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD', 'SALES'] },
  { id: 'team-ranking', label: '团队排名', icon: Trophy, path: '/team-ranking', roles: ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD'] },
  { id: 'reports', label: '数据报表', icon: BarChart3, path: '/reports', roles: ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD', 'SALES'] },
  { id: 'knowledge-base', label: '知识库', icon: BookOpen, path: '/knowledge-base' },
  { id: 'settings', label: '设置', icon: Settings, path: '/settings', roles: ['TENANT_ADMIN', 'SUPER_ADMIN'] },
  { id: 'help', label: '帮助', icon: HelpCircle, path: '/help' },
]

/**
 * 导航高亮判定：pathname 必须匹配；
 * - 项自带查询串（如 目标客户 ?status=target）→ 当前 URL 必须包含这些参数
 * - 项不带查询串 → 同路径的兄弟项命中其专属参数时本项不高亮（客户管理 vs 目标客户互斥）
 * 其余参数（?id=、?tab= 等详情/页签参数）不影响高亮
 */
function isNavActive(itemPath: string, location: { pathname: string; search: string }, allItems: typeof navItems): boolean {
  const [path, query] = itemPath.split('?')
  if (location.pathname !== path) return false
  const current = new URLSearchParams(location.search)
  const queryMatch = (q: string) => {
    const want = new URLSearchParams(q)
    return [...want].every(([k, v]) => current.get(k) === v)
  }
  if (query) return queryMatch(query)
  return !allItems.some((other) => {
    const [oPath, oQuery] = other.path.split('?')
    return other.path !== itemPath && oPath === path && !!oQuery && queryMatch(oQuery)
  })
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = useHasRole('TENANT_ADMIN', 'SUPER_ADMIN')
  const isSales = useHasRole('SALES')
  const isViewer = useHasRole('VIEWER')

  const visibleItems = navItems.filter((item) => {
    if (!item.roles) return true
    if (isAdmin) return true
    if (isViewer) {
      return ['workbench', 'knowledge-base', 'help'].includes(item.id)
    }
    return item.roles.includes('SALES') || (isSales ? false : item.roles.includes('DEPT_HEAD'))
  })

  return (
    <aside className="flex w-[152px] flex-col border-r border-border bg-surface py-4">
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white font-bold text-lg mx-4">
        AI
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active = isNavActive(item.path, location, navItems)
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-primary-muted text-primary shadow-glow'
                  : 'text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary'
              }`}
              title={item.label}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
