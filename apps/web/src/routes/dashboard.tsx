import { useMemo, useState } from 'react'
import { useDashboardMe } from '../hooks/use-dashboard.js'
import { useBriefing } from '../hooks/use-briefing.js'
import { usePendingItems, describeItem } from '../hooks/use-confirmations.js'
import { CommandCenter } from '../components/dashboard/command-center.js'
import { BattleCard } from '../components/dashboard/battle-card.js'
import { OtherFronts } from '../components/dashboard/other-fronts.js'
import { InboxBanner, buildInboxPreview } from '../components/dashboard/inbox-banner.js'
import { InboxDrawer } from '../components/dashboard/inbox-drawer.js'
import { ModuleMiniNav } from '../components/dashboard/module-mini-nav.js'
import { VisitPrepCard } from '../components/dashboard/visit-prep-card.js'
import { ErrorState } from '../components/ui/states.js'
import {
  buildBattleUnits,
  matchPriorityAction,
  groupPendingByCompany,
  pendingKeysOfUnit,
} from '../components/dashboard/battle.utils.js'

/**
 * 今日作战（issue #34 三区漏斗）
 * ① 指挥台：一句话战场判断 + 四格可点 KPI
 * ② 三大战役：任务按客户聚合，top3 为战役卡（可勾选完成、提醒条联动过堂抽屉），其余折叠
 * ③ 侧栏：收件箱入口横幅 + 近期拜访 + 模块四宫格；过堂抽屉为页内右侧 Drawer
 */
export default function Dashboard() {
  const { data: briefingData, isLoading: briefingLoading } = useBriefing()
  const { data: meData, isLoading: meLoading, isError: meError, refetch: refetchMe } = useDashboardMe()
  const { data: pendingItems, isLoading: pendingLoading } = usePendingItems({ status: 'pending' })

  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxFocusId, setInboxFocusId] = useState<string | null>(null)

  const openInbox = (focusItemId?: string) => {
    setInboxFocusId(focusItemId ?? null)
    setInboxOpen(true)
  }

  const counts = meData?.counts
  const todayTasks = meData?.todayTasks ?? { overdue: [], dueToday: [], highPriority: [], pending: [] }

  const units = useMemo(() => buildBattleUnits(todayTasks), [meData])
  const battles = units.slice(0, 3)
  const otherUnits = units.slice(3)

  const pendingList = useMemo(() => pendingItems ?? [], [pendingItems])
  const pendingByCompany = useMemo(() => groupPendingByCompany(pendingList), [pendingList])

  const pendingCount = pendingList.length
  const overdueTasks = todayTasks.overdue.length
  const todayActions = overdueTasks + todayTasks.dueToday.length

  const inboxPreview =
    pendingList.length > 0
      ? buildInboxPreview({
          itemType: pendingList[0].itemType,
          headline: describeItem(pendingList[0]).headline,
        })
      : null

  return (
    <div className="space-y-6">
      {/* 区域一：作战指挥台（判断层） */}
      <CommandCenter
        briefing={briefingData}
        isLoading={briefingLoading && !briefingData}
        kpis={{
          activeProjects: briefingData?.stats.activeProjects ?? 0,
          activeLeads: counts?.followUpLeads ?? 0,
          todayActions,
          overdueTasks,
          pendingConfirmations: pendingCount,
          staleProjects: briefingData?.stats.staleProjects ?? counts?.stuckProjects ?? 0,
        }}
        onOpenInbox={() => openInbox()}
      />

      {/* 区域二：今日主线 · 三大战役（执行层） + 区域三：侧栏（入口层） */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_18rem]">
        <section id="today-battles" aria-labelledby="today-battles-title" className="min-w-0 space-y-4">
          <h2 id="today-battles-title" className="sr-only">
            今日主线 · 三大战役
          </h2>

          {meLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface-elevated" />
              ))}
            </div>
          ) : meError ? (
            <ErrorState message="今日作战数据加载失败" onRetry={() => refetchMe()} />
          ) : battles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
              <p className="text-sm font-medium text-text-secondary">今日没有必须打响的战役</p>
              <p className="mt-1 text-xs text-text-tertiary">
                逾期与今日到期的任务会在这里按客户聚合成作战单元；主动推进可去商机页挑选战场
              </p>
            </div>
          ) : (
            <>
              {battles.map((unit, i) => {
                const pendingKeys = pendingKeysOfUnit(unit)
                const companyPending = pendingKeys
                  .map((k) => pendingByCompany.get(k))
                  .find((list): list is NonNullable<typeof list> => !!list && list.length > 0)
                return (
                  <BattleCard
                    key={unit.key}
                    unit={unit}
                    rank={i + 1}
                    pendingCount={companyPending?.length ?? 0}
                    firstPendingId={companyPending?.[0]?.id}
                    matchedAction={matchPriorityAction(unit, briefingData?.priorityActions ?? [])}
                    onOpenInbox={openInbox}
                  />
                )
              })}
              <OtherFronts units={otherUnits} />
            </>
          )}
        </section>

        <aside className="space-y-4" aria-label="侧栏">
          <InboxBanner
            count={pendingCount}
            preview={inboxPreview}
            isLoading={pendingLoading && !pendingItems}
            onClick={() => openInbox()}
          />
          <VisitPrepCard />
          <ModuleMiniNav
            leadCount={counts?.followUpLeads ?? 0}
            projectCount={counts?.stuckProjects ?? 0}
            taskCount={counts?.totalTasks ?? 0}
            visitCount={counts?.pendingVisits ?? 0}
          />
        </aside>
      </div>

      {/* 收件箱过堂抽屉（三处入口共用：指挥台 KPI / 战役卡提醒条 / 侧栏横幅） */}
      <InboxDrawer
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        focusItemId={inboxFocusId}
        onFocusConsumed={() => setInboxFocusId(null)}
      />
    </div>
  )
}
