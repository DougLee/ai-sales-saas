import { useChat } from '@ai-sdk/react'
import { useLocation } from 'react-router-dom'
import { useState, useCallback, useMemo } from 'react'
import { get, del } from '../lib/api.js'

const pageMap: Record<string, string> = {
  '/': 'workbench',
  '/leads': 'leads',
  '/projects': 'projects',
  '/visits': 'visits',
  '/customers': 'customers',
  '/contacts': 'contacts',
  '/tasks': 'tasks',
  '/knowledge-base': 'knowledge-base',
  '/alerts': 'alerts',
  '/settings': 'settings',
}

const CHAT_ID_KEY = 'ai-sales-chat-id'

export interface ChatSession {
  id: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface ChatMessageItem {
  id: string
  role: string
  content: string
  createdAt: string
}

export interface PaginatedMessages {
  messages: ChatMessageItem[]
  nextCursor: string | null
  hasMore: boolean
}

export interface HistoryState {
  oldestCursor: string | null
  hasMore: boolean
  isLoadingOlder: boolean
}

export function useCopilot() {
  const location = useLocation()
  const token = localStorage.getItem('token') || ''
  const savedId = localStorage.getItem(CHAT_ID_KEY) || undefined

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(savedId)
  const [historyState, setHistoryState] = useState<HistoryState>({
    oldestCursor: null,
    hasMore: true,
    isLoadingOlder: false,
  })

  const pageContext = useMemo(() => {
    const searchParams = new URLSearchParams(location.search)
    const entityType = searchParams.get('entityType') || undefined
    const entityId = searchParams.get('entityId') || undefined
    return {
      page: pageMap[location.pathname] || 'global',
      entityType,
      entityId,
    }
  }, [location.pathname, location.search])

  const chat = useChat({
    id: activeSessionId,
    api: `${import.meta.env.VITE_API_URL || ''}/api/agent/chat`,
    headers: { Authorization: `Bearer ${token}` },
    streamProtocol: 'text',
    body: {
      sessionId: activeSessionId,
      pageContext,
    },
  })

  // 加载历史会话列表
  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true)
    try {
      const res = await get<ChatSession[]>('/api/agent/chat/sessions')
      if (Array.isArray(res)) {
        setSessions(res)
      }
    } catch (e) {
      console.error('加载会话列表失败:', e)
    } finally {
      setIsLoadingSessions(false)
    }
  }, [])

  // 加载某个会话的历史消息（最近一页）
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    setHistoryState({ oldestCursor: null, hasMore: true, isLoadingOlder: false })
    try {
      const res = await get<PaginatedMessages>(
        `/api/agent/chat/sessions/${sessionId}/messages?limit=20`
      )
      if (res.messages) {
        const formattedMessages = res.messages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          createdAt: new Date(m.createdAt),
        }))
        chat.setMessages(formattedMessages)
        setHistoryState({
          oldestCursor: res.nextCursor,
          hasMore: res.hasMore,
          isLoadingOlder: false,
        })
        setActiveSessionId(sessionId)
        localStorage.setItem(CHAT_ID_KEY, sessionId)
      }
    } catch (e) {
      console.error('加载会话消息失败:', e)
    }
  }, [chat])

  // 加载更早的消息（向上滚动时触发）
  const loadOlderMessages = useCallback(async () => {
    if (!activeSessionId || !historyState.hasMore || historyState.isLoadingOlder) return

    setHistoryState((prev) => ({ ...prev, isLoadingOlder: true }))
    try {
      const res = await get<PaginatedMessages>(
        `/api/agent/chat/sessions/${activeSessionId}/messages?cursor=${encodeURIComponent(historyState.oldestCursor || '')}&limit=20`
      )
      if (res.messages && res.messages.length > 0) {
        const olderMessages = res.messages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          createdAt: new Date(m.createdAt),
        }))
        chat.setMessages((prev) => [...olderMessages, ...prev])
        setHistoryState({
          oldestCursor: res.nextCursor,
          hasMore: res.hasMore,
          isLoadingOlder: false,
        })
      } else {
        setHistoryState((prev) => ({ ...prev, hasMore: false, isLoadingOlder: false }))
      }
    } catch (e) {
      console.error('加载历史消息失败:', e)
      setHistoryState((prev) => ({ ...prev, isLoadingOlder: false }))
    }
  }, [activeSessionId, historyState.hasMore, historyState.isLoadingOlder, historyState.oldestCursor, chat])

  // 创建新会话
  const createNewSession = useCallback(() => {
    const newId = `sess_${Date.now()}`
    chat.setMessages([])
    setHistoryState({ oldestCursor: null, hasMore: true, isLoadingOlder: false })
    setActiveSessionId(newId)
    localStorage.setItem(CHAT_ID_KEY, newId)
  }, [chat])

  // 删除会话
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await del(`/api/agent/chat/sessions/${sessionId}`)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSessionId === sessionId) {
        createNewSession()
      }
    } catch (e) {
      console.error('删除会话失败:', e)
    }
  }, [activeSessionId, createNewSession])

  return {
    ...chat,
    pageContext,
    sessions,
    isLoadingSessions,
    activeSessionId,
    historyState,
    loadSessions,
    loadSessionMessages,
    loadOlderMessages,
    createNewSession,
    deleteSession,
  }
}
