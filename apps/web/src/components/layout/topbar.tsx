import { Sun, Moon, Bell, LogOut } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../../lib/api.js'
import { useUnreadAlerts } from '../../hooks/use-alerts.js'
import { useTheme } from '../../hooks/use-theme.js'
import { useAuthUser } from '../../hooks/use-auth.js'
import { USER_ROLES } from '@ai-sales/shared'

const pageTitles: Record<string, string> = {
  '/': '工作台',
  '/leads': '线索管理',
  '/projects': '商机管理',
  '/visits': '拜访记录',
  '/confirmations': '待确认',
  '/team-ranking': '团队排名',
  '/customers': '客户管理',
  '/contacts': '联系人',
  '/tasks': '任务管理',
  '/knowledge-base': '知识库',
  '/alerts': 'AI巡检中心',
  '/reports': '数据报表',
  '/dashboard': '数据看板',
  '/settings': '系统设置',
  '/help': '帮助中心',
}

export default function TopBar() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useTheme()
  const location = useLocation()
  const { data: unreadData } = useUnreadAlerts()
  const { data: authUser } = useAuthUser()
  const unreadCount = unreadData?.unreadCount || 0

  const pageTitle = pageTitles[location.pathname] || ''
  const roleLabel = authUser
    ? USER_ROLES.find((r) => r.value === authUser.role)?.label || authUser.role
    : ''
  const initials = authUser?.name?.slice(0, 1) || authUser?.email?.slice(0, 1) || '?'

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-text-secondary">
          {pageTitle}
        </h2>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary transition-colors"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          onClick={() => navigate('/alerts')}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary transition-colors"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* User profile */}
        {authUser && (
          <div className="flex items-center gap-2 pl-2 border-l border-border">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium text-text-primary leading-tight">{authUser.name}</p>
              <p className="text-[10px] text-text-tertiary leading-tight">{roleLabel}</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-primary-muted flex items-center justify-center text-primary text-xs font-semibold">
              {initials}
            </div>
          </div>
        )}

        <button
          onClick={logout}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-danger/10 hover:text-danger transition-colors"
          title="退出登录"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
