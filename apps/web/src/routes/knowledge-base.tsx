import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Upload, FileText, Loader2, Search, Database, Users, FolderOpen, Contact, CheckCircle, Lock, Globe, Building2 } from 'lucide-react'
import { useKbFiles, useUploadFile, useAnalyzeFile, useEnrollBulk, useKbSearch, type FileAnalysis } from '../hooks/use-knowledge-base.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { PageHeader } from '../components/ui/page-header.js'

const SCOPE_OPTIONS = [
  { key: 'ALL', label: '全部', icon: Database },
  { key: 'PERSONAL', label: '个人', icon: Lock },
  { key: 'TEAM', label: '部门', icon: Building2 },
  { key: 'TENANT', label: '租户', icon: Globe },
] as const

const SCOPE_LABELS: Record<string, string> = {
  PERSONAL: '个人',
  TEAM: '部门',
  TENANT: '租户',
}

const SCOPE_COLORS: Record<string, string> = {
  PERSONAL: 'bg-primary/10 text-primary',
  TEAM: 'bg-success/10 text-success',
  TENANT: 'bg-warning/10 text-warning',
}

export default function KnowledgeBase() {
  // P1：筛选状态进 URL，刷新/分享链接不丢筛选
  const [searchParams, setSearchParams] = useSearchParams()
  const fileScope = searchParams.get('scope') || 'ALL'
  const setFileScope = (v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (v === 'ALL') next.delete('scope')
      else next.set('scope', v)
      return next
    }, { replace: true })
  }
  const [uploadScope, setUploadScope] = useState('PERSONAL')
  const { data, isLoading, error: filesError } = useKbFiles(fileScope)
  const upload = useUploadFile()
  const analyze = useAnalyzeFile()
  const enroll = useEnrollBulk()

  const [dragOver, setDragOver] = useState(false)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<FileAnalysis | null>(null)
  const [selectedPreview, setSelectedPreview] = useState<Record<string, unknown[]> | null>(null)

  const files = data?.results || []

  const { query: searchQuery, setQuery: setSearchQuery, results: searchResults, searching, search } = useKbSearch()

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length === 0) return
    const formData = new FormData()
    dropped.forEach((f) => formData.append('files', f))
    formData.append('scope', uploadScope)
    upload.mutate(formData)
  }, [upload, uploadScope])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length === 0) return
    const formData = new FormData()
    selected.forEach((f) => formData.append('files', f))
    formData.append('scope', uploadScope)
    upload.mutate(formData)
    e.target.value = ''
  }, [upload, uploadScope])

  const handleAnalyze = async (id: string) => {
    setAnalyzingId(id)
    setAnalysisResult(null)
    setSelectedPreview(null)
    try {
      const result = await analyze.mutateAsync(id)
      setAnalysisResult(result)
      if (result.analysis?.enrollPreview) {
        setSelectedPreview(result.analysis.enrollPreview as Record<string, unknown[]>)
      }
    } finally {
      setAnalyzingId(null)
    }
  }

  const handleEnroll = () => {
    if (!selectedPreview) return
    enroll.mutate({
      accounts: selectedPreview.accounts || [],
      leads: selectedPreview.leads || [],
      projects: selectedPreview.projects || [],
      contacts: selectedPreview.contacts || [],
    })
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="space-y-5">
      {/* 页头（UI 统一 issue #36：PageHeader 同构） */}
      <PageHeader
        title="知识库"
        description={`${files.length} 个文件 · 拜访准备与方案支撑的弹药库`}
      />

      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border bg-surface'
        }`}
      >
        <Upload size={32} className="mx-auto mb-3 text-text-tertiary" />
        <p className="text-sm text-text-secondary">拖拽文件到此处，或点击上传</p>
        <p className="mt-1 text-xs text-text-tertiary">支持 PDF、Word、TXT、Markdown、CSV</p>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
          <Upload size={14} /> 选择文件
          <input type="file" multiple accept=".pdf,.doc,.docx,.txt,.md,.csv" className="hidden" onChange={handleFileInput} />
        </label>
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="text-xs text-text-tertiary">可见范围：</span>
          {SCOPE_OPTIONS.filter((s) => s.key !== 'ALL').map((s) => (
            <button
              key={s.key}
              onClick={() => setUploadScope(s.key)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors ${
                uploadScope === s.key
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary'
              }`}
            >
              <s.icon size={12} /> {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Semantic search */}
      {files.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search(searchQuery)}
              placeholder="输入关键词语义检索知识库..."
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
            <button
              onClick={() => search(searchQuery)}
              disabled={searching || !searchQuery.trim()}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              检索
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium text-text-tertiary">语义检索结果（{searchResults.length} 条）</p>
              {searchResults.map((r, idx) => (
                <div key={idx} className="rounded-xl bg-surface-elevated p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary">{r.fileName}</span>
                    <span className="text-[10px] text-text-tertiary">相似度 {(r.similarity * 100).toFixed(1)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary line-clamp-3">{r.content}</p>
                </div>
              ))}
            </div>
          )}

          {searchQuery && !searching && searchResults.length === 0 && (
            <p className="mt-3 text-xs text-text-tertiary">未检索到相关内容，请尝试其他关键词</p>
          )}
        </div>
      )}

      {/* File list */}
      {isLoading && <LoadingState />}

      {!isLoading && filesError && <ErrorState message={(filesError as Error).message || '文件列表加载失败'} />}

      {!isLoading && !filesError && files.length === 0 && (
        <EmptyState
          icon={Database}
          title="暂无文件"
          description="上传文档后，AI 会自动提取结构化信息"
        />
      )}

      {!isLoading && files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {SCOPE_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setFileScope(s.key)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors ${
                  fileScope === s.key
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary'
                }`}
              >
                <s.icon size={12} /> {s.label}
              </button>
            ))}
          </div>
          {files.map((file) => (
            <div key={file.id} className="flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{file.fileName}</p>
                    {file.scope && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SCOPE_COLORS[file.scope] || 'bg-text-tertiary/10 text-text-tertiary'}`}>
                        {SCOPE_LABELS[file.scope] || file.scope}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary">{formatSize(file.fileSize)} · {file.status}</p>
                </div>
              </div>
              <button
                onClick={() => handleAnalyze(file.id)}
                disabled={analyzingId === file.id}
                className="flex items-center gap-2 rounded-xl bg-surface-elevated px-3 py-2 text-sm text-text-secondary hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
              >
                {analyzingId === file.id ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                {analyzingId === file.id ? '分析中...' : 'AI 分析'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Analysis result */}
      {analysisResult && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">分析结果：{analysisResult.fileName}</h3>
          {analysisResult.analysis?.summary && (
            <p className="mb-4 text-sm text-text-secondary leading-relaxed">{analysisResult.analysis.summary}</p>
          )}

          {analysisResult.analysis?.entities && analysisResult.analysis.entities.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-xs font-medium text-text-tertiary">识别到的实体</p>
              <div className="grid gap-2">
                {analysisResult.analysis.entities.map((entity, idx) => (
                  <div key={idx} className="rounded-xl bg-surface-elevated p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{entity.name}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{entity.type}</span>
                    </div>
                    {entity.contacts && entity.contacts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {entity.contacts.map((c, cidx) => (
                          <div key={cidx} className="flex items-center gap-2 text-xs text-text-secondary">
                            <Contact size={12} />
                            <span>{c.name}</span>
                            {c.position && <span className="text-text-tertiary">({c.position})</span>}
                            {c.phone && <span className="text-text-tertiary">{c.phone}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedPreview && (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle size={16} className="text-primary" />
                <span className="text-sm font-medium text-text-primary">可导入预览</span>
              </div>

              <div className="space-y-3">
                {selectedPreview.accounts && selectedPreview.accounts.length > 0 && (
                  <PreviewSection icon={Database} title="目标客户池" items={selectedPreview.accounts} />
                )}
                {selectedPreview.leads && selectedPreview.leads.length > 0 && (
                  <PreviewSection icon={FileText} title="线索" items={selectedPreview.leads} />
                )}
                {selectedPreview.projects && selectedPreview.projects.length > 0 && (
                  <PreviewSection icon={FolderOpen} title="商机" items={selectedPreview.projects} />
                )}
                {selectedPreview.contacts && selectedPreview.contacts.length > 0 && (
                  <PreviewSection icon={Users} title="联系人" items={selectedPreview.contacts} />
                )}
              </div>

              <button
                onClick={handleEnroll}
                disabled={enroll.isPending}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {enroll.isPending ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                确认导入 CRM
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PreviewSection({ icon: Icon, title, items }: { icon: React.ElementType; title: string; items: unknown[] }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-text-secondary">
        <Icon size={14} />
        {title} ({items.length})
      </div>
      <div className="space-y-1">
        {items.map((item, idx) => {
          const record = item as Record<string, unknown>
          return (
            <div key={idx} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs">
              <span className="text-text-primary">{(record.name as string) || '-'}</span>
              {!!record.region && <span className="text-text-tertiary">{String(record.region)}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
