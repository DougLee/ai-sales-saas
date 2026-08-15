import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import Sidebar from './components/layout/sidebar'
import TopBar from './components/layout/topbar'
import AiCopilot from './components/layout/ai-copilot'
import AiCopilotToggle from './components/layout/ai-copilot-toggle'
import Toaster from './components/ui/toaster'
import { useCopilotStore } from './stores/copilot-store.js'
import Dashboard from './routes/dashboard'
import Alerts from './routes/alerts'
import Leads from './routes/leads'
import Projects from './routes/projects'
import Visits from './routes/visits'
import Confirmations from './routes/confirmations'
import TeamRanking from './routes/team-ranking'
import Customers from './routes/customers'
import Tasks from './routes/tasks'
import KnowledgeBase from './routes/knowledge-base'
import Reports from './routes/reports'
import Settings from './routes/settings'
import Contacts from './routes/contacts'
import HelpCenter from './routes/help-center'
import Login from './routes/login'
import NotFound from './routes/not-found'
import RequireRole from './components/auth/require-role'
import { ENTITY_NAVIGATE_EVENT, entityRouteTo, type EntityRef } from './lib/entity-links.js'
import type { UserRole } from '@ai-sales/shared'

// 路由级角色矩阵（与 sidebar navItems.roles 保持一致；模块级常量保证引用稳定）
const SALES_TEAM: UserRole[] = ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD', 'SALES']
const MANAGERS: UserRole[] = ['TENANT_ADMIN', 'SUPER_ADMIN', 'DEPT_HEAD']
const ADMINS: UserRole[] = ['TENANT_ADMIN', 'SUPER_ADMIN']

function Layout() {
  const navigate = useNavigate()
  const visible = useCopilotStore((state) => state.visible)

  // 监听 AI 回答中的实体链接点击，跳转到对应详情
  useEffect(() => {
    const handler = (e: Event) => {
      const ref = (e as CustomEvent<EntityRef>).detail
      if (!ref?.type || !ref?.id) return
      navigate(entityRouteTo(ref.type, ref.id))
    }
    window.addEventListener(ENTITY_NAVIGATE_EVENT, handler)
    return () => window.removeEventListener(ENTITY_NAVIGATE_EVENT, handler)
  }, [navigate])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col min-w-0">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            {/* 废弃路由重定向 */}
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/leads" element={<RequireRole roles={SALES_TEAM}><Leads /></RequireRole>} />
            <Route path="/projects" element={<RequireRole roles={SALES_TEAM}><Projects /></RequireRole>} />
            {/* ADR-0003 决策⑩：pipeline 页废除，漏斗视图并入商机推进工作台 */}
            <Route path="/pipeline" element={<Navigate to="/projects" replace />} />
            <Route path="/visits" element={<RequireRole roles={SALES_TEAM}><Visits /></RequireRole>} />
            <Route path="/confirmations" element={<RequireRole roles={SALES_TEAM}><Confirmations /></RequireRole>} />
            <Route path="/team-ranking" element={<RequireRole roles={MANAGERS}><TeamRanking /></RequireRole>} />
            <Route path="/customers" element={<RequireRole roles={SALES_TEAM}><Customers /></RequireRole>} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/knowledge-base" element={<KnowledgeBase />} />
            <Route path="/reports" element={<RequireRole roles={SALES_TEAM}><Reports /></RequireRole>} />
            <Route path="/settings" element={<RequireRole roles={ADMINS}><Settings /></RequireRole>} />
            <Route path="/help" element={<HelpCenter />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
      {visible && <AiCopilot />}
      <AiCopilotToggle />
      <Toaster />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<Layout />} />
    </Routes>
  )
}
