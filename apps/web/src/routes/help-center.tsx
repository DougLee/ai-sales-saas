import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HelpCircle, ChevronRight, BookOpen, Search, X } from 'lucide-react'
import { helpChapters } from '../components/help/help-data.js'
import { renderMarkdown } from '../lib/markdown.js'

export default function HelpCenter() {
  const location = useLocation()
  const navigate = useNavigate()
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [activeSection, setActiveSection] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ chapterId: string; sectionId: string; title: string; chapterTitle: string; preview: string }>>([])
  const contentRef = useRef<HTMLDivElement>(null)

  // Parse hash on mount
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (hash) {
      const [chapterId, sectionId] = hash.split('/')
      if (chapterId) {
        setExpandedChapters((prev) => new Set([...prev, chapterId]))
        if (sectionId) {
          setActiveSection(sectionId)
          setTimeout(() => {
            document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 100)
        }
      }
    } else {
      // Default expand first chapter
      setExpandedChapters(new Set([helpChapters[0].id]))
      setActiveSection(helpChapters[0].sections[0].id)
    }
  }, [location.hash])

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const scrollToSection = (chapterId: string, sectionId: string) => {
    setActiveSection(sectionId)
    navigate(`/help#${chapterId}/${sectionId}`, { replace: true })
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const q = query.toLowerCase()
    const results: typeof searchResults = []
    helpChapters.forEach((ch) => {
      ch.sections.forEach((sec) => {
        const contentLower = sec.content.toLowerCase()
        const titleLower = sec.title.toLowerCase()
        if (titleLower.includes(q) || contentLower.includes(q)) {
          const idx = contentLower.indexOf(q)
          const preview = idx >= 0 ? sec.content.slice(Math.max(0, idx - 30), idx + 80) : sec.content.slice(0, 100)
          results.push({
            chapterId: ch.id,
            sectionId: sec.id,
            title: sec.title,
            chapterTitle: ch.title,
            preview: preview + (preview.length < sec.content.length ? '...' : ''),
          })
        }
      })
    })
    setSearchResults(results)
  }

  return (
    <div className="flex h-full">
      {/* Left Sidebar - TOC */}
      <aside className="hidden w-64 shrink-0 lg:block shrink-0 overflow-y-auto border-r border-border bg-surface">
        <div className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2 text-text-primary">
            <BookOpen size={18} className="text-primary" />
            <span className="font-semibold">使用指南</span>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索帮助内容..."
              className="w-full rounded-lg border border-border bg-surface-elevated py-1.5 pl-8 pr-7 text-xs text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mx-3 mb-2 rounded-lg border border-primary/20 bg-primary/5 p-2">
            <p className="mb-1 text-[10px] font-medium text-primary">找到 {searchResults.length} 条结果</p>
            <div className="space-y-1">
              {searchResults.map((r) => (
                <button
                  key={`${r.chapterId}-${r.sectionId}`}
                  onClick={() => {
                    setExpandedChapters((prev) => new Set([...prev, r.chapterId]))
                    scrollToSection(r.chapterId, r.sectionId)
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                  className="w-full rounded-md px-2 py-1.5 text-left text-xs text-text-primary hover:bg-primary/10 transition-colors"
                >
                  <span className="font-medium">{r.title}</span>
                  <span className="ml-1 text-text-tertiary">({r.chapterTitle})</span>
                  <p className="mt-0.5 truncate text-[10px] text-text-tertiary">{r.preview}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chapter Tree */}
        <nav className="space-y-1 px-2 pb-4">
          {helpChapters.map((chapter) => {
            const expanded = expandedChapters.has(chapter.id)
            return (
              <div key={chapter.id}>
                <button
                  onClick={() => toggleChapter(chapter.id)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
                >
                  <ChevronRight
                    size={14}
                    className={`shrink-0 text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
                  />
                  {chapter.title}
                </button>
                {expanded && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
                    {chapter.sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(chapter.id, section.id)}
                        className={`block w-full rounded-md px-2 py-1 text-left text-xs transition-colors ${
                          activeSection === section.id
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary'
                        }`}
                      >
                        {section.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      {/* Right Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-6">
          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <HelpCircle size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-text-primary">AI销售管理系统 · 使用指南</h1>
              <p className="text-sm text-text-tertiary">面向销售人员和管理者的完整操作手册</p>
            </div>
          </div>

          {/* Content */}
          {helpChapters.map((chapter) => (
            <div key={chapter.id} className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-primary">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                  {helpChapters.findIndex((c) => c.id === chapter.id) + 1}
                </span>
                {chapter.title}
              </h2>
              <div className="space-y-6">
                {chapter.sections.map((section) => (
                  <section
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-6 rounded-2xl border border-border bg-surface p-5"
                  >
                    <h3 className="mb-3 text-base font-semibold text-text-primary">{section.title}</h3>
                    <div className="text-text-primary">
                      {renderMarkdown(section.content)}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          ))}

          {/* Footer */}
          <div className="mt-12 border-t border-border pt-6 text-center text-xs text-text-tertiary">
            <p>AI销售管理系统 · 使用指南</p>
            <p className="mt-1">如有疑问，请通过AI助手（小销）获取实时帮助</p>
          </div>
        </div>
      </div>
    </div>
  )
}
