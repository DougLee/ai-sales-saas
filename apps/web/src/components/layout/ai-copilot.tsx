import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Send,
  Mic,
  Bot,
  User,
  Loader2,
  CheckSquare,
  CalendarDays,
  ArrowRight,
  FileJson,
  Sparkles,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  History,
  MessageSquare,
  Copy,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  X,
} from 'lucide-react'
import { useCopilot } from '../../hooks/use-copilot.js'
import { post } from '../../lib/api.js'
import { toast } from '../../lib/toast.js'
import { extractJsonBlock } from '../../lib/extract-json-block.js'
import { StructuredOutputRenderer } from '../chat/structured-output.js'
import { renderMarkdown } from '../../lib/markdown.js'
import { useQueryClient } from '@tanstack/react-query'
import { useCopilotStore } from '../../stores/copilot-store.js'

interface ActionItem {
  type: 'create_task' | 'create_visit' | 'create_lead' | 'set_reminder' | 'get_briefing' | 'navigate'
  label: string
  params: Record<string, unknown>
}

function parseActions(content: string): { text: string; actions: ActionItem[] } {
  const match = content.match(/<!--ACTIONS-->([\s\S]*?)<!--\/ACTIONS-->/)
  if (!match) return { text: content, actions: [] }
  try {
    const actions = JSON.parse(match[1].trim()) as ActionItem[]
    const text = content.replace(match[0], '').trim()
    return { text, actions }
  } catch {
    return { text: content, actions: [] }
  }
}

async function executeAction(
  action: ActionItem,
  navigate: ReturnType<typeof useNavigate>,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  try {
    if (action.type === 'create_task') {
      const body = {
        title: action.params.title as string,
        description: action.params.description as string | undefined,
        priority: (action.params.priority as string) || 'MEDIUM',
        deadline: action.params.deadline as string | undefined,
        projectId: action.params.projectId as string | undefined,
      }
      await post('/api/tasks', body)
      toast('任务创建成功', 'success')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    } else if (action.type === 'create_visit') {
      const body = {
        projectId: action.params.projectId as string,
        summary: action.params.summary as string | undefined,
        visitType: (action.params.visitType as string) || 'offline',
        visitTime: new Date().toISOString(),
      }
      await post('/api/visits', body)
      toast('拜访记录创建成功', 'success')
      queryClient.invalidateQueries({ queryKey: ['visits'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    } else if (action.type === 'create_lead') {
      const body = {
        name: action.params.name as string,
        industry: action.params.industry as string | undefined,
        contactName: action.params.contactName as string | undefined,
        contactPhone: action.params.contactPhone as string | undefined,
        notes: action.params.notes as string | undefined,
      }
      await post('/api/leads', body)
      toast('线索创建成功', 'success')
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    } else if (action.type === 'set_reminder') {
      const body = {
        title: action.params.title as string,
        deadline: action.params.remindAt as string,
        priority: 'HIGH',
        projectId: action.params.projectId as string | undefined,
      }
      await post('/api/tasks', body)
      toast('提醒设置成功', 'success')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    } else if (action.type === 'get_briefing') {
      navigate('/')
      toast('已切换到工作台查看简报', 'success')
    } else if (action.type === 'navigate') {
      const path = action.params.path as string
      if (path) navigate(path)
    }
  } catch (err) {
    toast((err as Error).message || '执行失败', 'error')
  }
}

const QUICK_PROMPTS: Record<string, Array<{ label: string; prompt: string }>> = {
  visits: [
    { label: '准备拜访', prompt: '帮我准备下次拜访' },
    { label: '分析拜访', prompt: '分析这次拜访质量' },
    { label: '记录拜访', prompt: '记录一次拜访' },
  ],
  projects: [
    { label: '挖掘需求', prompt: '挖掘这个客户的需求' },
    { label: '跟进策略', prompt: '生成跟进策略' },
    { label: '推进里程碑', prompt: '推进这个项目到下一阶段' },
  ],
  leads: [
    { label: '评估线索', prompt: '评估这个线索价值' },
    { label: '创建线索', prompt: '帮我创建一条新线索' },
  ],
  workbench: [
    { label: '今日简报', prompt: '今日作战简报' },
    { label: 'Pipeline Review', prompt: '今日团队Pipeline Review' },
  ],
  global: [
    { label: '今日简报', prompt: '今日作战简报' },
    { label: '新手指南', prompt: '新销售入门指南' },
    { label: '开拓客户', prompt: '怎么开拓新客户' },
  ],
}

// 按日期分组消息
function ExpandableDetails({ defaultOpen, className, children }: { defaultOpen: boolean; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.open = defaultOpen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  )
}

function groupMessagesByDate(messages: Array<{ id: string; role: string; content: string; createdAt?: number | Date }>) {
  const groups: Record<string, typeof messages> = {}
  messages.forEach((msg) => {
    const date = msg.createdAt
      ? new Date(msg.createdAt).toLocaleDateString('zh-CN')
      : '今天'
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
  })
  return groups
}

export default function AiCopilot() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    append,
    reload,
    setInput,
    sessions,
    isLoadingSessions,
    activeSessionId,
    historyState,
    loadSessions,
    loadSessionMessages,
    loadOlderMessages,
    createNewSession,
    deleteSession,
    pageContext,
  } = useCopilot()

  const [executingId, setExecutingId] = useState<string | null>(null)
  const [width, setWidth] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ai-sales-copilot-width') : null
    const parsed = saved ? parseInt(saved, 10) : 360
    return Number.isFinite(parsed) && parsed >= 280 && parsed <= 800 ? parsed : 360
  })
  const [isResizing, setIsResizing] = useState(false)
  const [showSessionList, setShowSessionList] = useState(false)
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'up' | 'down'>>({})
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const hasLoadedRef = useRef(false)
  const isLoadingOlderRef = useRef(false)
  // 自动滚动开关用 ref：只作"用户是否在底部附近"的判定，不作为 effect 触发源（否则会与流式输出形成滚动拉锯）
  const shouldAutoScrollRef = useRef(true)

  const pageKey = location.pathname.replace(/^\//, '').split('/')[0] || 'global'
  const quickPrompts = QUICK_PROMPTS[pageKey] || QUICK_PROMPTS['global']

  const entityTypeLabel: Record<string, string> = {
    project: '商机',
    visit: '拜访',
    lead: '线索',
    customer: '客户',
    task: '任务',
    contact: '联系人',
  }

  const pageContextEntity = pageContext.entityType && pageContext.entityId
    ? `${entityTypeLabel[pageContext.entityType] || pageContext.entityType} ${pageContext.entityId.slice(0, 8)}`
    : null

  // 加载会话列表
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // 首次挂载时：
  // 1. 如果有 activeSessionId 但 messages 为空，尝试加载历史
  // 2. 如果没有 activeSessionId 但存在历史会话，自动加载最近一条（换浏览器/清缓存后恢复）
  useEffect(() => {
    if (hasLoadedRef.current) return
    if (isLoadingSessions || sessions.length === 0) return
    hasLoadedRef.current = true

    if (activeSessionId && messages.length === 0) {
      loadSessionMessages(activeSessionId).catch(() => {
        // 如果加载失败（会话可能已过期），加载最近一条，否则创建新会话
        const latest = sessions[0]
        if (latest) {
          loadSessionMessages(latest.id)
        } else {
          createNewSession()
        }
      })
    } else if (!activeSessionId) {
      // 无本地 sessionId 时，自动加载最近一条历史会话
      loadSessionMessages(sessions[0].id)
    }
  }, [activeSessionId, messages.length, sessions, isLoadingSessions, loadSessionMessages, createNewSession])

  // 自动滚动到底部（仅在用户位于底部附近时；只滚自己的容器，不用 scrollIntoView 避免带动页面滚动）
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, isLoading])

  // 加载更早消息并保留滚动位置
  const handleLoadOlder = useCallback(async () => {
    const container = messagesContainerRef.current
    if (!container || historyState.isLoadingOlder || !historyState.hasMore) return

    const oldHeight = container.scrollHeight
    const oldTop = container.scrollTop

    await loadOlderMessages()

    requestAnimationFrame(() => {
      const newHeight = container.scrollHeight
      container.scrollTop = oldTop + (newHeight - oldHeight)
    })
  }, [historyState.isLoadingOlder, historyState.hasMore, loadOlderMessages])

  // 监听滚动：
  // 1. 判断是否靠近顶部，触发加载更早消息
  // 2. 判断是否靠近底部，控制自动滚动开关
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      const isNearTop = scrollTop < 100

      shouldAutoScrollRef.current = isNearBottom

      if (isNearTop && historyState.hasMore && !historyState.isLoadingOlder && !isLoadingOlderRef.current) {
        isLoadingOlderRef.current = true
        handleLoadOlder().finally(() => {
          isLoadingOlderRef.current = false
        })
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [historyState.hasMore, historyState.isLoadingOlder, handleLoadOlder])

  // 拖拽调整宽度
  useEffect(() => {
    localStorage.setItem('ai-sales-copilot-width', String(width))
    // 同步 CSS 变量，供浮动切换按钮在助手打开时避让面板
    document.documentElement.style.setProperty('--copilot-width', `${width}px`)
    return () => {
      document.documentElement.style.removeProperty('--copilot-width')
    }
  }, [width])

  useEffect(() => {
    if (!isResizing) return
    const onMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      setWidth(Math.min(Math.max(newWidth, 280), 800))
    }
    const onUp = () => setIsResizing(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizing])

  // 全局事件监听：快速提问
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail
      if (append && prompt) {
        append({ role: 'user', content: prompt })
      }
    }
    window.addEventListener('ai-copilot-prompt', handler)
    return () => window.removeEventListener('ai-copilot-prompt', handler)
  }, [append])

  const handleActionClick = async (action: ActionItem, toolCallId: string) => {
    setExecutingId(toolCallId)
    await executeAction(action, navigate, queryClient)
    setExecutingId(null)
  }

  // 语音输入：识别结果追加到输入框；组件卸载时兜底停止识别
  const handleMicClick = () => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      toast('当前浏览器不支持语音输入', 'error')
      return
    }
    const rec = new SR() as any
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<{ 0: { transcript: string } }>)
        .slice(e.resultIndex)
        .map((r) => r[0].transcript)
        .join('')
      if (text) setInput((prev: string) => (prev ? prev + text : text))
    }
    rec.onerror = (e: any) => {
      if (e.error !== 'aborted') toast(`语音识别失败：${e.error}`, 'error')
      setListening(false)
    }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      toast('无法启动语音识别', 'error')
    }
  }

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  const toggleDateCollapse = (date: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev)
      if (next.has(date)) {
        next.delete(date)
      } else {
        next.add(date)
      }
      return next
    })
  }

  // 自动折叠超过 3 天的旧消息（仅首次渲染时）
  useEffect(() => {
    if (messages.length === 0) return
    const groups = groupMessagesByDate(messages)
    const dates = Object.keys(groups)
    if (dates.length > 3) {
      const toCollapse = new Set<string>()
      dates.slice(0, dates.length - 3).forEach((d) => toCollapse.add(d))
      setCollapsedDates(toCollapse)
    }
  }, [activeSessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const groupedMessages = groupMessagesByDate(messages)
  const sortedDates = Object.keys(groupedMessages).sort((a, b) => {
    if (a.includes('今天')) return 1
    if (b.includes('今天')) return -1
    // 按实际日期时间戳排序，避免字符串比较导致 "2026/6/8" > "2026/6/10"
    const da = new Date(a)
    const db = new Date(b)
    return (isNaN(da.getTime()) ? 0 : da.getTime()) - (isNaN(db.getTime()) ? 0 : db.getTime())
  })

  const handleSelectSession = async (sessionId: string) => {
    setShowSessionList(false)
    if (sessionId === activeSessionId) return
    await loadSessionMessages(sessionId)
  }

  const handleCreateNew = () => {
    setShowSessionList(false)
    createNewSession()
  }

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    if (!confirm('确定删除此会话？')) return
    await deleteSession(sessionId)
  }

  const lastAssistantMsgId = [...messages].reverse().find((m) => m.role === 'assistant')?.id

  const visible = useCopilotStore((state) => state.visible)
  const hideCopilot = useCopilotStore((state) => state.hide)
  if (!visible) return null

  const handleCopy = async (content: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(msgId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast('复制失败', 'error')
    }
  }

  const handleFeedback = async (msgId: string, type: 'up' | 'down') => {
    setFeedbackMap((prev) => ({ ...prev, [msgId]: type }))
    try {
      await post('/api/agent/chat/feedback', { messageId: msgId, type })
    } catch {
      // 静默失败，UI 已更新
    }
  }

  return (
    <aside className="relative flex flex-col border-l border-border bg-surface" style={{ width }}>
      <div
        onMouseDown={() => setIsResizing(true)}
        className={`absolute left-0 top-0 z-10 h-full cursor-col-resize transition-colors ${
          isResizing ? 'w-1 bg-primary/40' : 'w-2 bg-border hover:bg-primary/30'
        }`}
        title="拖拽调整宽度"
      />

      {/* 顶部栏 */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-3">
        <Bot size={20} className="text-primary shrink-0" />
        <span className="text-sm font-semibold text-text-primary shrink-0">小销</span>

        {pageContextEntity && (
          <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary truncate max-w-[120px]" title={pageContextEntity}>
            {pageContextEntity}
          </span>
        )}

        {/* Session 切换下拉 */}
        <div className="relative ml-2 flex-1 min-w-0">
          <button
            onClick={() => setShowSessionList((v) => !v)}
            className="flex w-full items-center gap-1 rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated/80 transition-colors"
          >
            <History size={12} className="shrink-0" />
            <span className="truncate">
              {sessions.find((s) => s.id === activeSessionId)?.title || '新会话'}
            </span>
            {showSessionList ? <ChevronUp size={12} className="shrink-0 ml-auto" /> : <ChevronDown size={12} className="shrink-0 ml-auto" />}
          </button>

          {showSessionList && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-surface-elevated shadow-lg">
              <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface-elevated px-2 py-1.5">
                <span className="text-[10px] font-medium text-text-tertiary">历史会话</span>
                <button
                  onClick={handleCreateNew}
                  className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <Plus size={10} />
                  新建
                </button>
              </div>

              {isLoadingSessions && (
                <div className="flex items-center justify-center py-3 text-xs text-text-tertiary">
                  <Loader2 size={12} className="animate-spin mr-1" />
                  加载中...
                </div>
              )}

              {!isLoadingSessions && sessions.length === 0 && (
                <div className="px-3 py-3 text-xs text-text-tertiary text-center">暂无历史会话</div>
              )}

              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={`group flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-background/50 transition-colors ${
                    session.id === activeSessionId ? 'bg-primary/5 text-primary' : 'text-text-secondary'
                  }`}
                >
                  <MessageSquare size={12} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{session.title || '未命名会话'}</div>
                    <div className="text-[10px] text-text-tertiary">
                      {new Date(session.updatedAt).toLocaleDateString('zh-CN')} · {session.messageCount} 条消息
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    className="shrink-0 rounded p-0.5 text-text-tertiary hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除"
                  >
                    <Trash2 size={10} />
                  </button>
                </button>
              ))}
            </div>
          )}
        </div>

        <span
          title={error ? '服务异常' : isLoading ? '思考中' : '就绪'}
          className={`ml-auto h-2 w-2 shrink-0 rounded-full ${error ? 'bg-danger' : isLoading ? 'bg-warning animate-pulse' : 'bg-success'}`}
        />

        <button
          type="button"
          onClick={hideCopilot}
          title="收起小销助手"
          className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-elevated hover:text-text-primary transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* 消息区域 */}
      <div ref={messagesContainerRef} className="flex-1 overflow-auto overscroll-contain p-4 space-y-4">
        {historyState.isLoadingOlder && (
          <div className="flex items-center justify-center py-3 text-xs text-text-tertiary">
            <Loader2 size={12} className="animate-spin mr-1" />
            加载历史消息...
          </div>
        )}

        {!historyState.hasMore && messages.length > 0 && (
          <div className="flex items-center justify-center py-3 text-xs text-text-tertiary">
            没有更多历史消息
          </div>
        )}

        {messages.length === 0 && !historyState.isLoadingOlder && (
          <div className="rounded-xl bg-surface-elevated p-3 text-sm text-text-secondary">
            你好，我是你的销售智能助手。可以帮你分析商机、准备拜访话术、或复盘客户动态。
          </div>
        )}

        {sortedDates.map((date) => {
          const isCollapsed = collapsedDates.has(date)
          const dateMessages = groupedMessages[date]
          return (
            <div key={date} className="space-y-3">
              {/* 日期分隔线 */}
              <button
                onClick={() => toggleDateCollapse(date)}
                className="flex w-full items-center justify-center gap-1 py-1 text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <span className="h-px flex-1 bg-border" />
                <span className="shrink-0 px-2">{date}</span>
                {isCollapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
                <span className="h-px flex-1 bg-border" />
              </button>

              {!isCollapsed &&
                dateMessages.map((msg) => {
                  const { text, actions } =
                    msg.role === 'assistant' && msg.content
                      ? parseActions(msg.content)
                      : { text: msg.content, actions: [] }
                  const { text: cleanText, json, intent } =
                    msg.role === 'assistant' ? extractJsonBlock(text) : { text, json: null, intent: null }
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          msg.role === 'user'
                            ? 'bg-primary-muted text-primary'
                            : 'bg-surface-elevated text-text-secondary'
                        }`}
                      >
                        {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                      </div>
                      <div
                        className={`relative group max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-white'
                            : 'bg-surface-elevated text-text-primary'
                        }`}
                      >
                        {(cleanText || (msg.role === 'assistant' && isLoading)) && (
                          <div className="leading-relaxed">
                            {msg.role === 'assistant' && isLoading && !cleanText
                              ? '思考中...'
                              : renderMarkdown(cleanText)}
                          </div>
                        )}
                        {json !== null && json !== undefined && (
                          <ExpandableDetails
                            className={cleanText ? 'mt-3 border-t border-border pt-3' : ''}
                            defaultOpen={!!intent && ['visit_analysis', 'lead_assessment', 'team_management'].includes(intent)}
                          >
                            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-text-secondary select-none">
                              <FileJson size={12} />
                              结构化分析结果
                              {intent && <span className="text-text-tertiary">({intent})</span>}
                              <span className="ml-auto text-[10px] text-text-tertiary">点击折叠</span>
                            </summary>
                            <div className="mt-2">
                              <StructuredOutputRenderer json={json} intent={intent} />
                            </div>
                          </ExpandableDetails>
                        )}

                        {actions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {actions.map((action, idx) => {
                              const icon =
                                action.type === 'create_task'
                                  ? <CheckSquare size={12} />
                                  : action.type === 'create_visit'
                                    ? <CalendarDays size={12} />
                                    : <ArrowRight size={12} />
                              const id = `${msg.id}-action-${idx}`
                              return (
                                <button
                                  key={idx}
                                  onClick={() => handleActionClick(action, id)}
                                  disabled={executingId === id}
                                  className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
                                >
                                  {executingId === id ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    icon
                                  )}
                                  {action.label}
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {/* 消息快捷操作栏 */}
                        {msg.role === 'assistant' && !isLoading && (
                          <div className="absolute -top-2.5 -right-2 flex items-center gap-0.5 rounded-full bg-surface border border-border shadow-sm px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <button
                              onClick={() => handleCopy(msg.content, msg.id)}
                              className="flex items-center justify-center h-5 w-5 rounded-full text-text-tertiary hover:text-primary hover:bg-primary/10 transition-colors"
                              title={copiedId === msg.id ? '已复制' : '复制'}
                            >
                              {copiedId === msg.id ? <CheckSquare size={10} className="text-success" /> : <Copy size={10} />}
                            </button>
                            {msg.id === lastAssistantMsgId && (
                              <button
                                onClick={() => reload?.()}
                                className="flex items-center justify-center h-5 w-5 rounded-full text-text-tertiary hover:text-primary hover:bg-primary/10 transition-colors"
                                title="重新生成"
                              >
                                <RotateCcw size={10} />
                              </button>
                            )}
                            <button
                              onClick={() => handleFeedback(msg.id, 'up')}
                              className={`flex items-center justify-center h-5 w-5 rounded-full transition-colors ${feedbackMap[msg.id] === 'up' ? 'text-success bg-success/10' : 'text-text-tertiary hover:text-success hover:bg-success/10'}`}
                              title="有用"
                            >
                              <ThumbsUp size={10} />
                            </button>
                            <button
                              onClick={() => handleFeedback(msg.id, 'down')}
                              className={`flex items-center justify-center h-5 w-5 rounded-full transition-colors ${feedbackMap[msg.id] === 'down' ? 'text-danger bg-danger/10' : 'text-text-tertiary hover:text-danger hover:bg-danger/10'}`}
                              title="无用"
                            >
                              <ThumbsDown size={10} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          )
        })}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-secondary">
              <Bot size={14} />
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-surface-elevated px-3 py-2 text-sm text-text-secondary">
              <Loader2 size={14} className="animate-spin" />
              思考中...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
            {(error as Error).message || '请求失败'}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="border-t border-border p-3 space-y-2">
        {quickPrompts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => append({ role: 'user', content: qp.prompt })}
                disabled={isLoading}
                className="flex items-center gap-1 rounded-lg border border-primary/15 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                <Sparkles size={10} />
                {qp.label}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            // 发送消息 = 用户想看最新回复，强制回到底部
            shouldAutoScrollRef.current = true
            handleSubmit(e)
          }}
          className="flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2"
        >
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="输入指令或问题..."
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleMicClick}
            title={listening ? '停止语音输入' : '语音输入'}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              listening ? 'text-danger animate-pulse bg-danger/10' : 'text-text-tertiary hover:text-primary'
            }`}
          >
            <Mic size={16} />
          </button>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </aside>
  )
}
