import { useEffect, useState } from 'react'
import { Moon, Sun, Globe, Shield, Brain, BookOpen, ChevronDown, ChevronUp, Loader2, Zap, Download, Pencil, Check, X, Key, Server, Cpu, Search, Mic, Users } from 'lucide-react'
import { useTheme } from '../hooks/use-theme.js'
import { PageHeader } from '../components/ui/page-header.js'
import { SectionCard } from '../components/ui/section-card.js'
import { useMethodologyConfigs, useCreateMethodologyConfig } from '../hooks/use-methodology-config.js'
import MemberManager from '../components/settings/member-manager.js'
import { get, post } from '../lib/api.js'
import { downloadCSV, exportConfigs, getFieldValue } from '../lib/export.js'
import { toast } from '../lib/toast.js'

interface AIConfig {
  provider: string
  openaiApiKey: string
  openaiBaseUrl: string
  modelName: string
  hasKey: boolean
  bingSearchApiKey: string
  tavilyApiKey: string
  hasSearch: boolean
  embeddingModelName: string
  embeddingDimension: number
  embeddingUseSameCredentials: boolean
  embeddingBaseUrl: string
  embeddingApiKey: string
  hasEmbedding: boolean
  senseVoiceApiKey: string
  senseVoiceBaseUrl: string
  hasVoice: boolean
  capabilities: {
    streaming: boolean
    toolCalling: boolean
    jsonMode: boolean
  }
}

/** API Key 脱敏：查看态只露头尾，不明文渲染 */
function maskApiKey(key?: string): string {
  if (!key) return '***'
  if (key.length <= 8) return `${key.slice(0, 2)}••••`
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

export default function Settings() {
  const { isDark, toggleTheme } = useTheme()
  const [expandedModule, setExpandedModule] = useState<string | null>(null)
  const [exportingLabel, setExportingLabel] = useState<string | null>(null)
  const [editingModule, setEditingModule] = useState<string | null>(null)
  const [editJson, setEditJson] = useState('')
  const { data: methodologyData, isLoading: methodologyLoading } = useMethodologyConfigs()
  const createConfig = useCreateMethodologyConfig()
  const configs = methodologyData || []

  // AI 配置状态
  const [showMembers, setShowMembers] = useState(false)
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiEditing, setAiEditing] = useState(false)
  const [aiForm, setAiForm] = useState({
    openaiApiKey: '', openaiBaseUrl: '', modelName: '', bingSearchApiKey: '', tavilyApiKey: '',
    embeddingModelName: 'text-embedding-3-small', embeddingDimension: 1536, embeddingUseSameCredentials: true,
    embeddingBaseUrl: '', embeddingApiKey: '', senseVoiceApiKey: '', senseVoiceBaseUrl: '',
  })
  const [testingEmbedding, setTestingEmbedding] = useState(false)
  const [testingModel, setTestingModel] = useState(false)

  useEffect(() => {
    setAiLoading(true)
    get<AIConfig>('/api/system-config/ai')
      .then((data) => {
        setAiConfig(data)
        setAiForm({
          openaiApiKey: data.openaiApiKey || '',
          openaiBaseUrl: data.openaiBaseUrl || '',
          modelName: data.modelName || '',
          bingSearchApiKey: data.bingSearchApiKey || '',
          tavilyApiKey: data.tavilyApiKey || '',
          embeddingModelName: data.embeddingModelName || 'text-embedding-3-small',
          embeddingDimension: data.embeddingDimension || 1536,
          embeddingUseSameCredentials: data.embeddingUseSameCredentials ?? true,
          embeddingBaseUrl: data.embeddingBaseUrl || '',
          embeddingApiKey: data.embeddingApiKey || '',
          senseVoiceApiKey: data.senseVoiceApiKey || '',
          senseVoiceBaseUrl: data.senseVoiceBaseUrl || '',
        })
      })
      .catch((err) => toast.error('获取 AI 配置失败：' + (err as Error).message))
      .finally(() => setAiLoading(false))
  }, [])

  const saveAiConfig = async () => {
    try {
      await post('/api/system-config/ai', {
        openaiApiKey: aiForm.openaiApiKey || undefined,
        openaiBaseUrl: aiForm.openaiBaseUrl || undefined,
        modelName: aiForm.modelName || undefined,
        bingSearchApiKey: aiForm.bingSearchApiKey || undefined,
        tavilyApiKey: aiForm.tavilyApiKey || undefined,
        embeddingModelName: aiForm.embeddingModelName || undefined,
        embeddingDimension: Number(aiForm.embeddingDimension) || undefined,
        embeddingUseSameCredentials: aiForm.embeddingUseSameCredentials,
        embeddingBaseUrl: aiForm.embeddingBaseUrl || undefined,
        embeddingApiKey: aiForm.embeddingApiKey || undefined,
        senseVoiceApiKey: aiForm.senseVoiceApiKey || undefined,
        senseVoiceBaseUrl: aiForm.senseVoiceBaseUrl || undefined,
      })
      const updated = await get<AIConfig>('/api/system-config/ai')
      setAiConfig(updated)
      setAiEditing(false)
      toast.success('AI 配置已保存')
    } catch (err) {
      toast.error('保存失败：' + (err as Error).message)
    }
  }

  const testEmbedding = async () => {
    setTestingEmbedding(true)
    try {
      const res = await post<{ message: string }>('/api/system-config/ai/test-embedding', {})
      toast.success(res.message || 'Embedding 连接成功')
    } catch (err) {
      toast.error('测试失败：' + (err as Error).message)
    } finally {
      setTestingEmbedding(false)
    }
  }

  const testModel = async () => {
    setTestingModel(true)
    try {
      const res = await post<{ message?: string }>('/api/system-config/ai/test-model', {})
      toast.success(res.message || '模型连接成功')
    } catch (err) {
      toast.error('测试失败：' + (err as Error).message)
    } finally {
      setTestingModel(false)
    }
  }

  const handleExport = async (config: (typeof exportConfigs)[number]) => {
    if (exportingLabel) return
    setExportingLabel(config.label)
    try {
      const res = await get<{ items?: unknown[] }>(config.apiPath)
      const items = res?.items || []
      if (items.length === 0) {
        toast.info(`${config.label}暂无数据`)
        return
      }
      const rows = [config.headers]
      for (const item of items as Record<string, unknown>[]) {
        rows.push(config.fields.map((f) => getFieldValue(item, f)))
      }
      downloadCSV(config.filename, rows)
      toast.success(`${config.label}导出成功`)
    } catch (err) {
      toast.error((err as Error).message || '导出失败')
    } finally {
      setExportingLabel(null)
    }
  }

  const startEdit = (config: typeof configs[number]) => {
    setEditingModule(config.id)
    setEditJson(JSON.stringify(config.configJson, null, 2))
  }

  const cancelEdit = () => {
    setEditingModule(null)
    setEditJson('')
  }

  const saveEdit = async (config: typeof configs[number]) => {
    try {
      const parsed = JSON.parse(editJson)
      await createConfig.mutateAsync({
        moduleType: config.moduleType,
        configJson: parsed,
      })
      setEditingModule(null)
      setEditJson('')
    } catch (err) {
      if (err instanceof SyntaxError) {
        toast.error('JSON 格式错误：' + err.message)
      } else {
        toast.error((err as Error).message || '保存失败')
      }
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="系统设置" subtitle="外观、AI 能力与组织配置" />

      {/* 外观 */}
      <SectionCard title="外观" padded={false}>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              {isDark ? <Moon size={18} className="text-primary" /> : <Sun size={18} className="text-warning" />}
              <div>
                <p className="text-sm font-medium text-text-primary">{isDark ? '暗色模式' : '明亮模式'}</p>
                <p className="text-xs text-text-tertiary">切换界面明暗主题</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative h-6 w-11 rounded-full transition-colors ${isDark ? 'bg-primary' : 'bg-border'}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between px-6 py-4 opacity-50">
            <div className="flex items-center gap-3">
              <Globe size={18} className="text-text-secondary" />
              <div>
                <p className="text-sm font-medium text-text-primary">语言</p>
                <p className="text-xs text-text-tertiary">当前：简体中文</p>
              </div>
            </div>
            <span className="text-xs text-text-tertiary">即将上线</span>
          </div>
        </div>
      </SectionCard>

      {/* AI 配置 */}
      <SectionCard title="AI 配置" padded={false}>
        <div className="divide-y divide-border">
          {aiLoading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 size={20} className="animate-spin text-primary" />
            </div>
          )}

          {!aiLoading && aiConfig && (
            <>
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <Brain size={18} className="text-primary" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">AI 助手模型</p>
                    <p className="text-xs text-text-tertiary">当前：{aiConfig.modelName || '默认模型'}（{aiConfig.provider || '自定义'}）</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${aiConfig.hasKey ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                    {aiConfig.hasKey ? '已配置' : '未配置'}
                  </span>
                  {!aiEditing && (
                    <button
                      onClick={() => setAiEditing(true)}
                      className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-elevated hover:text-primary transition-colors"
                    >
                      <Pencil size={12} /> 编辑
                    </button>
                  )}
                </div>
              </div>

              {aiEditing ? (
                <div className="px-6 pb-4 space-y-3">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                      <Key size={14} /> API Key
                    </label>
                    <input
                      type="password"
                      value={aiForm.openaiApiKey}
                      onChange={(e) => setAiForm({ ...aiForm, openaiApiKey: e.target.value })}
                      placeholder="输入 API Key，留空则使用环境变量"
                      className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                    />
                    <p className="text-xs text-text-tertiary">留空表示使用服务端环境变量中的默认配置</p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                      <Server size={14} /> Base URL
                    </label>
                    <input
                      type="text"
                      value={aiForm.openaiBaseUrl}
                      onChange={(e) => setAiForm({ ...aiForm, openaiBaseUrl: e.target.value })}
                      placeholder="如 http://127.0.0.1:8000/v1"
                      className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                        <Cpu size={14} /> 模型名称
                      </label>
                      <button
                        onClick={testModel}
                        disabled={testingModel || !aiForm.openaiApiKey}
                        className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-elevated hover:text-primary transition-colors disabled:opacity-50"
                      >
                        {testingModel ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                        测试连接
                      </button>
                    </div>
                    <input
                      type="text"
                      value={aiForm.modelName}
                      onChange={(e) => setAiForm({ ...aiForm, modelName: e.target.value })}
                      placeholder="如 gpt-4o-mini、deepseek-v4-flash、qwen-plus"
                      className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                    />
                  </div>

                  <div className="border-t border-border pt-3 space-y-3">
                    <p className="text-xs font-medium text-text-secondary">网络检索配置（可选）</p>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                        <Search size={14} /> Tavily API Key（推荐，AI 专用搜索）
                      </label>
                      <input
                        type="password"
                        value={aiForm.tavilyApiKey}
                        onChange={(e) => setAiForm({ ...aiForm, tavilyApiKey: e.target.value })}
                        placeholder="输入 Tavily API Key"
                        className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                      />
                      <p className="text-xs text-text-tertiary">优先使用 Tavily，专为 AI Agent 优化，结果质量更高</p>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                        <Search size={14} /> Bing Search API Key（备选）
                      </label>
                      <input
                        type="password"
                        value={aiForm.bingSearchApiKey}
                        onChange={(e) => setAiForm({ ...aiForm, bingSearchApiKey: e.target.value })}
                        placeholder="输入 Bing Web Search API Key"
                        className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                      />
                      <p className="text-xs text-text-tertiary">未配置 Tavily 时自动回退到 Bing，每月免费额度 1000 次（国内可直接访问）</p>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-text-secondary">Embedding 模型配置（知识库语义检索）</p>
                      <button
                        onClick={testEmbedding}
                        disabled={testingEmbedding}
                        className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-elevated hover:text-primary transition-colors disabled:opacity-50"
                      >
                        {testingEmbedding ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                        测试连接
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        checked={aiForm.embeddingUseSameCredentials}
                        onChange={(e) => setAiForm({ ...aiForm, embeddingUseSameCredentials: e.target.checked })}
                        className="rounded border-border"
                      />
                      复用上方 BaseURL 和 API Key
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                        <Cpu size={14} /> Embedding 模型名
                      </label>
                      <input
                        type="text"
                        value={aiForm.embeddingModelName}
                        onChange={(e) => setAiForm({ ...aiForm, embeddingModelName: e.target.value })}
                        placeholder="如 text-embedding-3-small"
                        className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                        向量维度
                      </label>
                      <input
                        type="number"
                        value={aiForm.embeddingDimension}
                        onChange={(e) => setAiForm({ ...aiForm, embeddingDimension: Number(e.target.value) })}
                        placeholder="1536"
                        className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                      />
                    </div>
                    {!aiForm.embeddingUseSameCredentials && (
                      <>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                            <Server size={14} /> Embedding Base URL
                          </label>
                          <input
                            type="text"
                            value={aiForm.embeddingBaseUrl}
                            onChange={(e) => setAiForm({ ...aiForm, embeddingBaseUrl: e.target.value })}
                            placeholder="如 http://127.0.0.1:8000/v1"
                            className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                            <Key size={14} /> Embedding API Key
                          </label>
                          <input
                            type="password"
                            value={aiForm.embeddingApiKey}
                            onChange={(e) => setAiForm({ ...aiForm, embeddingApiKey: e.target.value })}
                            placeholder="独立的 Embedding API Key"
                            className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="border-t border-border pt-3 space-y-3">
                    <p className="text-xs font-medium text-text-secondary">语音录入配置（可选）</p>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                        <Mic size={14} /> SenseVoice API Key
                      </label>
                      <input
                        type="password"
                        value={aiForm.senseVoiceApiKey}
                        onChange={(e) => setAiForm({ ...aiForm, senseVoiceApiKey: e.target.value })}
                        placeholder="输入阿里云 DashScope API Key"
                        className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                        <Server size={14} /> SenseVoice Base URL（可选）
                      </label>
                      <input
                        type="text"
                        value={aiForm.senseVoiceBaseUrl}
                        onChange={(e) => setAiForm({ ...aiForm, senseVoiceBaseUrl: e.target.value })}
                        placeholder="默认 https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription"
                        className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
                      />
                      <p className="text-xs text-text-tertiary">使用私有化部署或第三方代理时填写，留空走阿里云官方地址</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => {
                        setAiEditing(false)
                        if (aiConfig) {
                          setAiForm({
                            openaiApiKey: aiConfig.openaiApiKey || '',
                            openaiBaseUrl: aiConfig.openaiBaseUrl || '',
                            modelName: aiConfig.modelName || '',
                            bingSearchApiKey: aiConfig.bingSearchApiKey || '',
                            tavilyApiKey: aiConfig.tavilyApiKey || '',
                            embeddingModelName: aiConfig.embeddingModelName || 'text-embedding-3-small',
                            embeddingDimension: aiConfig.embeddingDimension || 1536,
                            embeddingUseSameCredentials: aiConfig.embeddingUseSameCredentials ?? true,
                            embeddingBaseUrl: aiConfig.embeddingBaseUrl || '',
                            embeddingApiKey: aiConfig.embeddingApiKey || '',
                            senseVoiceApiKey: aiConfig.senseVoiceApiKey || '',
                            senseVoiceBaseUrl: aiConfig.senseVoiceBaseUrl || '',
                          })
                        }
                      }}
                      className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
                    >
                      <X size={12} /> 取消
                    </button>
                    <button
                      onClick={saveAiConfig}
                      className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
                    >
                      <Check size={12} /> 保存
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-6 py-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Base URL</span>
                    <span className="text-text-primary font-mono">{aiConfig.openaiBaseUrl || '默认'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">API Key</span>
                    <span className="text-text-primary font-mono">{maskApiKey(aiConfig.openaiApiKey)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">模型</span>
                    <span className="text-text-primary">{aiConfig.modelName || '默认模型'}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {aiConfig.capabilities?.toolCalling ? (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">支持工具调用</span>
                    ) : (
                      <span className="rounded-full bg-orange-400/10 px-2 py-0.5 text-xs text-orange-400">不支持工具调用</span>
                    )}
                    {aiConfig.capabilities?.streaming && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">流式输出</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">网络检索</span>
                    <span className={`text-xs font-medium ${aiConfig.hasSearch ? 'text-success' : 'text-text-tertiary'}`}>
                      {aiConfig.hasSearch ? '已配置' : '未配置'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Embedding（语义检索）</span>
                    <span className={`text-xs font-medium ${aiConfig.hasEmbedding ? 'text-success' : 'text-text-tertiary'}`}>
                      {aiConfig.hasEmbedding ? aiConfig.embeddingModelName || '已配置' : '未配置'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">语音录入</span>
                    <span className={`text-xs font-medium ${aiConfig.hasVoice ? 'text-success' : 'text-text-tertiary'}`}>
                      {aiConfig.hasVoice ? '已配置' : '未配置'}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <Zap size={18} className="text-warning" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">智能预警</p>
                    <p className="text-xs text-text-tertiary">商机停滞、线索逾期自动提醒</p>
                  </div>
                </div>
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">已启用</span>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* 销售方法论 */}
      <SectionCard title="销售方法论" padded={false}>
        <>
          {methodologyLoading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 size={20} className="animate-spin text-primary" />
            </div>
          )}

          {!methodologyLoading && configs.length === 0 && (
            <div className="p-8 text-center text-text-tertiary">
              <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">暂无方法论配置</p>
            </div>
          )}

          {!methodologyLoading && configs.map((config) => {
            const moduleName = config.moduleType === 'MILESTONE' ? '里程碑方法论'
              : config.moduleType === 'SPIN' ? 'SPIN 销售法'
              : config.moduleType === 'HUMAN_INFO' ? '人物画像分析'
              : config.moduleType
            const stages = config.configJson?.stages || []
            return (
              <div key={config.id} className="border-b border-border last:border-0">
                <button
                  onClick={() => setExpandedModule(expandedModule === config.id ? null : config.id)}
                  className="flex w-full items-center justify-between px-6 py-4 hover:bg-surface-elevated/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <BookOpen size={18} className="text-primary" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-text-primary">{moduleName}</p>
                      <p className="text-xs text-text-tertiary">{config.moduleType} · v{config.version}</p>
                    </div>
                  </div>
                  {expandedModule === config.id ? <ChevronUp size={16} className="text-text-tertiary" /> : <ChevronDown size={16} className="text-text-tertiary" />}
                </button>

                {expandedModule === config.id && (
                  <div className="px-6 pb-4 space-y-3">
                    <div className="flex justify-end gap-2">
                      {editingModule === config.id ? (
                        <>
                          <button
                            onClick={() => saveEdit(config)}
                            disabled={createConfig.isPending}
                            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                          >
                            {createConfig.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            保存
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
                          >
                            <X size={12} /> 取消
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEdit(config)}
                          className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-elevated hover:text-primary transition-colors"
                        >
                          <Pencil size={12} /> 编辑
                        </button>
                      )}
                    </div>

                    {editingModule === config.id ? (
                      <div className="space-y-2">
                        <p className="text-xs text-text-tertiary">编辑 JSON 配置，保存后将创建新版本</p>
                        <textarea
                          value={editJson}
                          onChange={(e) => setEditJson(e.target.value)}
                          rows={16}
                          className="w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-xs text-text-primary outline-none focus:border-primary"
                        />
                      </div>
                    ) : (
                      <>
                        {config.moduleType === 'MILESTONE' && stages.length > 0 && (
                          <div className="space-y-2">
                            {stages.map((m, idx) => (
                              <div key={idx} className="rounded-xl bg-surface-elevated p-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-text-primary">{m.name}</span>
                                  <span className="text-xs text-text-tertiary">阶段 {m.stage + 1}</span>
                                </div>
                                {m.criteria.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {m.criteria.map((c, cidx) => (
                                      <span key={cidx} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{c}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {config.moduleType === 'SPIN' && (
                          <div className="space-y-2">
                            {['situation', 'problem', 'implication', 'needPayoff'].map((dim) => {
                              const d = config.configJson?.[dim as keyof typeof config.configJson] as { prompt?: string } | undefined
                              return d?.prompt ? (
                                <div key={dim} className="rounded-xl bg-surface-elevated p-3">
                                  <p className="text-sm font-medium text-text-primary uppercase">{dim}</p>
                                  <p className="mt-1 text-xs text-text-secondary">{d.prompt}</p>
                                </div>
                              ) : null
                            })}
                          </div>
                        )}
                        {config.moduleType === 'HUMAN_INFO' && config.configJson?.dimensions && (
                          <div className="space-y-2">
                            {config.configJson.dimensions.map((d, idx) => (
                              <div key={idx} className="rounded-xl bg-surface-elevated p-3">
                                <p className="text-sm font-medium text-text-primary">{d.role}</p>
                                {d.trustIndicators.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {d.trustIndicators.map((t, tidx) => (
                                      <span key={tidx} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{t}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </>
      </SectionCard>

      {/* 组织与成员 */}
      <SectionCard title="组织与成员" padded={false}>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <Users size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">成员角色管理</p>
                <p className="text-xs text-text-tertiary">查看租户成员并调整角色权限</p>
              </div>
            </div>
            <button
              onClick={() => setShowMembers(true)}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
            >
              管理成员
            </button>
          </div>
        </div>
      </SectionCard>

      <MemberManager open={showMembers} onClose={() => setShowMembers(false)} />

      {/* 安全与隐私 */}
      <SectionCard title="安全与隐私" padded={false}>
        <div className="divide-y divide-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield size={18} className="text-text-secondary" />
                <div>
                  <p className="text-sm font-medium text-text-primary">数据导出</p>
                  <p className="text-xs text-text-tertiary">导出 CRM 数据为 CSV 格式</p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {exportConfigs.map((cfg) => (
                <button
                  key={cfg.label}
                  onClick={() => handleExport(cfg)}
                  disabled={!!exportingLabel}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-elevated hover:text-primary transition-colors disabled:opacity-50"
                >
                  {exportingLabel === cfg.label ? (
                    <Loader2 size={12} className="animate-spin text-primary" />
                  ) : (
                    <Download size={12} />
                  )}
                  导出{cfg.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
