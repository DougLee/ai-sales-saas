import { useNavigate } from 'react-router-dom'
import { useDashboardMe } from '../hooks/use-dashboard.js'
import { useBriefing } from '../hooks/use-briefing.js'
import { BriefingCard } from '../components/dashboard/briefing-card.js'
import { ModuleNavCard } from '../components/dashboard/module-nav-card.js'
import { TaskListCard } from '../components/dashboard/task-list-card.js'
import { ProjectAlertCard } from '../components/dashboard/project-alert-card.js'
import { LeadFollowUpCard } from '../components/dashboard/lead-follow-up-card.js'
import { PendingConfirmationCard } from '../components/dashboard/pending-confirmation-card.js'
import { VisitPrepCard } from '../components/dashboard/visit-prep-card.js'

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: briefingData, isLoading: briefingLoading } = useBriefing()
  const { data: meData, isLoading: meLoading } = useDashboardMe()

  const counts = meData?.counts

  return (
    <div className="space-y-6">
      {/* 区域一：作战简报（决策层） */}
      <section aria-labelledby="daily-briefing-title">
        <div id="daily-briefing">
          {briefingLoading ? (
            <div className="rounded-2xl border border-border bg-surface p-6">
              <div className="h-6 w-48 animate-pulse rounded-lg bg-surface-elevated" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-elevated" />
                ))}
              </div>
            </div>
          ) : briefingData ? (
            <BriefingCard briefing={briefingData} />
          ) : null}
        </div>
      </section>

      {/* 区域二：作战模块导航（入口层） */}
      <section aria-labelledby="module-nav-title">
        <h2 id="module-nav-title" className="sr-only">作战模块导航</h2>
        <ModuleNavCard
          leadCount={counts?.followUpLeads ?? 0}
          projectCount={counts?.stuckProjects ?? 0}
          taskCount={counts?.totalTasks ?? 0}
          visitCount={counts?.pendingVisits ?? 0}
        />
      </section>

      {/* 区域三：今日执行（执行层） */}
      <section aria-labelledby="today-execution-title">
        <h2 id="today-execution-title" className="sr-only">今日执行</h2>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TaskListCard
            tasks={meData?.todayTasks ?? { overdue: [], dueToday: [], highPriority: [], pending: [] }}
            isLoading={meLoading}
            onItemClick={(id) => navigate(`/tasks?id=${id}`)}
          />
          <ProjectAlertCard
            projects={meData?.stuckProjects ?? { gateBlocked: [], stale: [], lowHealth: [], urgent: [] }}
            isLoading={meLoading}
            onItemClick={(id) => navigate(`/projects?id=${id}`)}
          />
        </div>
      </section>

      {/* 区域四：跟进提醒（关注层） */}
      <section aria-labelledby="follow-up-title">
        <h2 id="follow-up-title" className="sr-only">跟进提醒</h2>
        <LeadFollowUpCard
          leads={meData?.followUpLeads ?? { active: [], longOverdue: [] }}
          isLoading={meLoading}
          onItemClick={(id) => navigate(`/leads?id=${id}`)}
        />
      </section>

      {/* 区域五：确认态 + 拜访准备（V6.1 §十 工作台升级） */}
      <section aria-labelledby="confirmation-prep-title">
        <h2 id="confirmation-prep-title" className="sr-only">待确认与拜访准备</h2>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <PendingConfirmationCard />
          <VisitPrepCard />
        </div>
      </section>
    </div>
  )
}
