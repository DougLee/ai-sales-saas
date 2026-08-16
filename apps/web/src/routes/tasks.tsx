import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, Loader2, Pencil, Trash2, CheckCircle2, Calendar, Flag, ListTodo, ChevronDown, ChevronRight, Target } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useTasks, useTask, useCreateTask, useUpdateTask, useCompleteTask, useDeleteTask, type Task } from '../hooks/use-tasks.js'
import { useProjects } from '../hooks/use-projects.js'
import Drawer from '../components/ui/drawer.js'
import AiEntryButton from '../components/ai/ai-entry-button.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { PageHeader } from '../components/ui/page-header.js'
import { StatusPill, type PillTone } from '../components/ui/status-pill.js'
import { useConfirmDialog } from '../hooks/use-confirm-dialog.js'
import { deadlineInfo, focusTasks, groupTasks, groupTitle, isOverdue } from '../lib/task-utils.js'

/* 状态→语义色映射收敛到 tone（issue #36 一色一义），颜色只在 StatusPill 内收口 */
const priorityMap: Record<string, { label: string; tone: PillTone; strong?: boolean }> = {
  LOW: { label: '低', tone: 'urgency-low' },
  MEDIUM: { label: '中', tone: 'urgency-mid' },
  HIGH: { label: '高', tone: 'urgency-high' },
  URGENT: { label: '紧急', tone: 'urgency-high', strong: true },
}

const statusMap: Record<string, { label: string; tone: PillTone }> = {
  PENDING: { label: '待办', tone: 'neutral' },
  IN_PROGRESS: { label: '进行中', tone: 'primary' },
  COMPLETED: { label: '已完成', tone: 'success' },
  CANCELLED: { label: '已取消', tone: 'neutral' },
}

const sourceMap: Record<string, { label: string; tone: PillTone }> = {
  project_next_follow_up: { label: '跟进提醒', tone: 'primary' },
  visit_next_action: { label: '拜访提醒', tone: 'info' },
  visit_analysis: { label: 'AI 提取', tone: 'level-manual' },
  lead_follow_up: { label: '线索跟进', tone: 'warning' },
  company_unclaimed_release: { label: '公海池释放', tone: 'danger' },
  stale_project_notify: { label: '停滞提醒', tone: 'danger' },
  daily_scan_STALE_PROJECT: { label: '巡检', tone: 'neutral' },
  daily_scan_OVERDUE_LEAD: { label: '巡检', tone: 'neutral' },
  daily_scan_DUE_TASK: { label: '巡检', tone: 'neutral' },
  daily_scan_LOW_HEALTH: { label: '巡检', tone: 'neutral' },
  daily_scan_MISSING_VISIT: { label: '巡检', tone: 'neutral' },
}

/* 优先级图标底（Flag 徽标位）与 pill 同语义 */
const PRIORITY_ICON_CLS: Record<string, string> = {
  LOW: 'bg-urgency-low/10 text-urgency-low',
  MEDIUM: 'bg-urgency-mid/10 text-urgency-mid',
  HIGH: 'bg-urgency-high/10 text-urgency-high',
  URGENT: 'bg-urgency-high/20 text-urgency-high',
}

const TABS: Array<{ key: string; label: string; match: (t: Task) => boolean }> = [
  { key: 'active', label: '进行中', match: (t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS' },
  { key: 'COMPLETED', label: '已完成', match: (t) => t.status === 'COMPLETED' },
  { key: 'CANCELLED', label: '已取消', match: (t) => t.status === 'CANCELLED' },
  { key: 'all', label: '全部', match: () => true },
]

export default function Tasks() {
  const [search, setSearch] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  // P1：状态页签进 URL，刷新/从预警跳转不丢视图
  const tab = searchParams.get('tab') || 'active'
  const setTab = (v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (v === 'active') next.delete('tab')
      else next.set('tab', v)
      return next
    }, { replace: true })
  }
  const [openForm, setOpenForm] = useState(false)
  const [editingItem, setEditingItem] = useState<Task | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  // 分组折叠状态持久化：组多的页面只展开关心的组
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('tasks-group-collapsed') || '{}')
    } catch {
      return {}
    }
  })
  const toggleGroup = (key: string) => {
    setCollapsedMap((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem('tasks-group-collapsed', JSON.stringify(next))
      } catch { /* 隐私模式等场景静默降级 */ }
      return next
    })
  }

  const { data, isLoading, error } = useTasks()
  // P1：详情走独立查询，任务操作后随 ['task', id] 失效自动刷新
  const { data: detailItem } = useTask(detailId)
  const { data: projectsData } = useProjects()
  const create = useCreateTask()
  const update = useUpdateTask()
  const complete = useCompleteTask()
  const del = useDeleteTask()
  const confirmDialog = useConfirmDialog()
  const saving = create.isPending || update.isPending

  const allTasks = useMemo(() => data?.items || [], [data])
  const taskId = searchParams.get('id')
  useEffect(() => {
    if (!taskId) return
    setDetailId(taskId)
    setSearchParams({}, { replace: true })
  }, [taskId, setSearchParams])

  const activeTab = TABS.find((t) => t.key === tab) || TABS[0]
  const searched = allTasks.filter((t) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  )
  const visibleTasks = searched.filter(activeTab.match)
  const groups = groupTasks(visibleTasks)
  const overdueCount = allTasks.filter(isOverdue).length
  // 今日聚焦：只在「进行中」页签展示（逾期 + 今天到期），每天清零的清单
  const focusList = useMemo(
    () => (activeTab.key === 'active' ? focusTasks(searched) : []),
    [activeTab.key, searched],
  )

  const handleEdit = (task: Task) => {
    setEditingItem(task)
    setOpenForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog.confirm({
      title: '删除任务',
      description: '删除后不可恢复，确定删除这条任务吗？',
      confirmLabel: '删除',
      danger: true,
    }))) return
    del.mutate(id)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload: Record<string, string> = {}
    fd.forEach((v, k) => { if (typeof v === 'string' && v.trim()) payload[k] = v.trim() })

    try {
      if (editingItem) {
        await update.mutateAsync({ id: editingItem.id, data: payload })
      } else {
        await create.mutateAsync(payload)
      }
      // 成功才关窗；失败保留表单内容（错误提示由 hook 的 toast 负责）
      setOpenForm(false)
      setEditingItem(undefined)
    } catch {
      /* 失败不关窗，用户已填内容不丢 */
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="任务管理"
        badge={overdueCount > 0 ? <StatusPill tone="urgency-high">{overdueCount} 条已逾期</StatusPill> : undefined}
        actions={
          <>
            <AiEntryButton
              prompt="帮我梳理当前任务，哪些需要优先处理"
              label="问小销"
              variant="primary"
              className="rounded-xl px-4 py-2 text-sm"
            />
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索任务..."
                className="h-10 rounded-xl border border-border bg-surface pl-9 pr-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
              />
            </div>
            <button
              onClick={() => { setEditingItem(undefined); setOpenForm(true) }}
              className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Plus size={16} /> 新建任务
            </button>
          </>
        }
      />

      {/* 状态页签：默认只看进行中，已完成/已取消收进页签 */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1 w-fit">
        {TABS.map((t) => {
          const count = searched.filter(t.match).length
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface-elevated'
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : 'text-text-tertiary'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* 今日聚焦：逾期 + 今天到期，跨项目聚合，每天清零 */}
      {focusList.length > 0 && (
        <div className="rounded-2xl border border-warning/40 bg-warning/5">
          <div className="flex items-center gap-2 border-b border-warning/20 px-5 py-3">
            <Target size={15} className="text-warning" />
            <span className="text-sm font-semibold text-text-primary">今日聚焦</span>
            <StatusPill tone="warning">{focusList.length} 条</StatusPill>
          </div>
          <div className="divide-y divide-warning/10">
            {focusList.map((task) => {
              const info = deadlineInfo(task)
              const groupLabel = groupTitle(task.project?.company?.name || task.company?.name || '', task.project?.name)
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-warning/10 transition-colors cursor-pointer"
                  onClick={() => setDetailId(task.id)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${PRIORITY_ICON_CLS[task.priority] || ''}`}>
                      <Flag size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text-primary">{task.title}</p>
                      <p className="truncate text-xs text-text-tertiary">{groupLabel}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {info && (
                      <span className={`whitespace-nowrap text-xs font-medium ${info.tone === 'danger' ? 'text-danger' : 'text-warning'}`}>
                        {info.text}
                      </span>
                    )}
                    <button
                      onClick={() => complete.mutate(task.id)}
                      disabled={complete.isPending}
                      className="rounded-lg p-1.5 text-text-tertiary hover:bg-success/10 hover:text-success transition-colors disabled:opacity-50"
                      title="标记完成"
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {isLoading && <LoadingState />}

        {error && <ErrorState message={(error as Error).message || '加载失败'} />}

        {!isLoading && !error && visibleTasks.length === 0 && (
          <EmptyState
            icon={ListTodo}
            title={search ? '没有匹配的任务' : activeTab.key === 'active' ? '暂无进行中的任务' : '暂无任务'}
            description={activeTab.key === 'active' && !search ? '点击右上角「新建任务」开始安排工作' : undefined}
          />
        )}

        {!isLoading && !error && groups.map((group) => {
          const groupOverdue = group.tasks.filter(isOverdue).length
          const groupDueToday = group.tasks.filter((t) => deadlineInfo(t)?.tone === 'warning').length
          // 搜索时强制展开，避免命中结果被折叠藏住
          const collapsed = !search && !!collapsedMap[group.key]
          return (
            <div key={group.key} className="rounded-2xl border border-border bg-surface">
              {/* 组头：客户 · 商机（点击折叠/展开） */}
              <button
                onClick={() => toggleGroup(group.key)}
                className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-surface-elevated/50 transition-colors rounded-t-2xl"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {collapsed ? <ChevronRight size={14} className="shrink-0 text-text-tertiary" /> : <ChevronDown size={14} className="shrink-0 text-text-tertiary" />}
                  <span className="truncate text-sm font-medium text-text-primary">{group.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {groupOverdue > 0 && (
                    <StatusPill tone="urgency-high">逾期 {groupOverdue}</StatusPill>
                  )}
                  {groupDueToday > 0 && (
                    <StatusPill tone="warning">今日 {groupDueToday}</StatusPill>
                  )}
                  <span className="text-xs text-text-tertiary">{group.tasks.length} 条</span>
                </span>
              </button>
              {!collapsed && (
                <div className="divide-y divide-border border-t border-border">
                  {group.tasks.map((task) => {
                    const info = deadlineInfo(task)
                    const done = task.status === 'COMPLETED' || task.status === 'CANCELLED'
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-elevated/50 transition-colors cursor-pointer"
                        onClick={() => setDetailId(task.id)}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {task.status === 'COMPLETED' ? (
                            <CheckCircle2 size={20} className="shrink-0 text-success" />
                          ) : (
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${PRIORITY_ICON_CLS[task.priority] || ''}`}>
                              <Flag size={14} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className={`truncate font-medium text-text-primary ${done ? 'line-through text-text-tertiary' : ''}`}>
                              {task.title}
                            </p>
                            <div className="flex items-center gap-3 text-sm text-text-secondary">
                              {info && (
                                <span className={`flex items-center gap-1 whitespace-nowrap ${
                                  info.tone === 'danger' ? 'font-medium text-danger' :
                                  info.tone === 'warning' ? 'font-medium text-warning' :
                                  'text-text-tertiary'
                                }`}>
                                  <Calendar size={12} />
                                  {info.text}
                                </span>
                              )}
                              {task.source && sourceMap[task.source] && (
                                <StatusPill tone={sourceMap[task.source].tone}>
                                  {sourceMap[task.source].label}
                                </StatusPill>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <StatusPill tone={statusMap[task.status]?.tone ?? 'neutral'}>
                            {statusMap[task.status]?.label || task.status}
                          </StatusPill>
                          {!done && (
                            <button
                              onClick={() => complete.mutate(task.id)}
                              disabled={complete.isPending}
                              className="rounded-lg p-1.5 text-text-tertiary hover:bg-success/10 hover:text-success transition-colors disabled:opacity-50"
                              title="标记完成"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(task)}
                            className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary transition-colors"
                            title="编辑"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(task.id)}
                            className="rounded-lg p-1.5 text-text-tertiary hover:bg-danger/10 hover:text-danger transition-colors"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Form Drawer */}
      <Drawer open={openForm} onClose={() => { if (!saving) { setOpenForm(false); setEditingItem(undefined) } }} title={editingItem ? '编辑任务' : '新建任务'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">任务标题 *</label>
            <input name="title" defaultValue={editingItem?.title} required className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">描述</label>
            <textarea name="description" defaultValue={editingItem?.description || ''} rows={3} className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">优先级</label>
              <select name="priority" defaultValue={editingItem?.priority || 'MEDIUM'} className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary">
                <option value="LOW">低</option>
                <option value="MEDIUM">中</option>
                <option value="HIGH">高</option>
                <option value="URGENT">紧急</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">状态</label>
              <select name="status" defaultValue={editingItem?.status || 'PENDING'} className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary">
                <option value="PENDING">待办</option>
                <option value="IN_PROGRESS">进行中</option>
                <option value="COMPLETED">已完成</option>
                <option value="CANCELLED">已取消</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">截止日期</label>
            <input name="deadline" type="date" defaultValue={editingItem?.deadline ? editingItem.deadline.slice(0, 10) : ''} className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">关联商机</label>
            <select name="projectId" defaultValue={editingItem?.projectId || ''} className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary">
              <option value="">不关联</option>
              {(projectsData?.items || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company?.name ? `${p.company.name} · ${p.name}` : p.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-tertiary">选择商机后自动关联所属客户</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" disabled={saving} onClick={() => { setOpenForm(false); setEditingItem(undefined) }} className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-elevated disabled:opacity-50">取消</button>
            <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editingItem ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Detail Drawer */}
      <Drawer open={!!detailId} onClose={() => setDetailId(undefined)} title="任务详情">
        {detailId && !detailItem && <LoadingState />}
        {detailItem && (
          <div className="space-y-5">
            <div>
              <label className="text-xs text-text-tertiary">标题</label>
              <p className="text-base font-medium text-text-primary">{detailItem.title}</p>
            </div>
            <div>
              <label className="text-xs text-text-tertiary">描述</label>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{detailItem.description || '-'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-tertiary">优先级</label>
                <p className="text-sm text-text-primary">{priorityMap[detailItem.priority]?.label || detailItem.priority}</p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">状态</label>
                <p className="text-sm text-text-primary">{statusMap[detailItem.status]?.label || detailItem.status}</p>
              </div>
            </div>
            {(detailItem.project?.name || detailItem.company?.name) && (
              <div>
                <label className="text-xs text-text-tertiary">归属</label>
                <p className="text-sm text-text-primary">
                  {[detailItem.project?.company?.name || detailItem.company?.name, detailItem.project?.name].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-tertiary">截止日期</label>
                <p className={`text-sm ${isOverdue(detailItem) ? 'font-medium text-danger' : 'text-text-primary'}`}>
                  {detailItem.deadline ? new Date(detailItem.deadline).toLocaleDateString('zh-CN') : '-'}
                  {isOverdue(detailItem) && '（已逾期）'}
                </p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">完成时间</label>
                <p className="text-sm text-text-primary">{detailItem.completedAt ? new Date(detailItem.completedAt).toLocaleString('zh-CN') : '-'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-tertiary">创建时间</label>
                <p className="text-sm text-text-primary">{new Date(detailItem.createdAt).toLocaleString('zh-CN')}</p>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">更新时间</label>
                <p className="text-sm text-text-primary">{new Date(detailItem.updatedAt).toLocaleString('zh-CN')}</p>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <AiEntryButton
                prompt={`请帮我分析这个任务：${detailItem.title}${detailItem.project?.name ? '（项目：' + detailItem.project.name + '）' : ''}`}
                label="问小销：分析这个任务"
                variant="ghost"
                entityType="task"
                entityId={detailItem.id}
              />
            </div>
          </div>
        )}
      </Drawer>

      {confirmDialog.dialog}
    </div>
  )
}
