import { useState, useEffect, useCallback } from 'react'

const THEME_KEY = 'ai-sales-theme'

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem(THEME_KEY) as Theme | null
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'dark') {
    html.classList.add('dark')
    html.classList.remove('light')
  } else {
    html.classList.add('light')
    html.classList.remove('dark')
  }
}

let globalTheme: Theme = getInitialTheme()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((cb) => cb())
}

export function initTheme() {
  applyTheme(globalTheme)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(globalTheme)

  useEffect(() => {
    const cb = () => setThemeState(globalTheme)
    listeners.add(cb)
    return () => { listeners.delete(cb) }
  }, [])

  const setTheme = useCallback((newTheme: Theme) => {
    globalTheme = newTheme
    localStorage.setItem(THEME_KEY, newTheme)
    applyTheme(newTheme)
    notify()
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(globalTheme === 'dark' ? 'light' : 'dark')
  }, [setTheme])

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' }
}
