import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Loader2, Wand2, RotateCcw, Save, Sparkles } from 'lucide-react'
import { useCreateVisit, useVisitPrep, type VisitPrep } from '../../hooks/use-visits.js'
import { useProjects } from '../../hooks/use-projects.js'
import Modal from '../ui/modal.js'
import { post } from '../../lib/api.js'
import { sendAiPrompt } from '../../lib/ai-prompt.js'
import { useFormDraft } from '../../hooks/use-form-draft.js'

const SpeechRecognitionAPI = (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null

interface ExtractedVisit {
  projectId?: string
  projectName?: string
  summary?: string
  visitType?: 'online' | 'offline' | 'phone'
  visitTime?: string
  contactName?: string
  contactPosition?: string
  nextAction?: string
  nextActionDeadline?: string
}

interface VoiceVisitFormProps {
  open: boolean
  onClose: () => void
}

type Step = 'record' | 'extracting' | 'preview'

export default function VoiceVisitForm({ open, onClose }: VoiceVisitFormProps) {
  const [step, setStep] = useState<Step>('record')
  const [transcript, setTranscript] = useState('')
  const [extracted, setExtracted] = useState<ExtractedVisit>({})
  const [error, setError] = useState('')
  const [prepData, setPrepData] = useState<VisitPrep | undefined>(undefined)
  const [copilotInsights, setCopilotInsights] = useState<Array<{ type: string; content: string }>>([])
  const [copilotLoading, setCopilotLoading] = useState(false)

  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [, setUsingLocalAsr] = useState(false)
  const [localAsrUnavailable, setLocalAsrUnavailable] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recognitionRef = useRef<any>(null)
  const lastPrepProjectId = useRef<string | undefined>(undefined)

  const create = useCreateVisit()
  const prep = useVisitPrep()
  const { data: projectsData } = useProjects()
  const projectOptions = projectsData?.items || []

  // P2 草稿机制：长转写文本来之不易，自动存草稿，打开时提示恢复
  const draft = useFormDraft<{ transcript: string; extracted: ExtractedVisit; step: Step }>('voice-visit-form', open)
  const [pendingDraft, setPendingDraft] = useState<{ transcript: string; extracted: ExtractedVisit; step: Step } | null>(null)

  useEffect(() => {
    if (!open) return
    // 每次打开先回到干净状态（上次未提交的内容走草稿恢复，不靠内存残留）
    setStep('record')
    setTranscript('')
    setExtracted({})
    setError('')
    setPrepData(undefined)
    setRecordingTime(0)
    lastPrepProjectId.current = undefined
    const saved = draft.restore()
    setPendingDraft(saved && saved.transcript?.trim() ? saved : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 草稿自动保存（有内容才写；草稿待确认期间不覆盖旧草稿）
  useEffect(() => {
    if (!open || pendingDraft) return
    if (!transcript.trim() && !extracted.summary) return
    draft.save({ transcript, extracted, step })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingDraft, transcript, extracted, step])

  const handleRestoreDraft = () => {
    if (!pendingDraft) return
    setTranscript(pendingDraft.transcript)
    setExtracted(pendingDraft.extracted || {})
    setStep(pendingDraft.step === 'preview' ? 'preview' : 'record')
    setPendingDraft(null)
  }

  const handleDiscardDraft = () => {
    draft.clear()
    setPendingDraft(null)
  }

  /** 释放录音相关全部资源（识别器 / 录音器 / 麦克风轨道 / 计时器），且不触发转写回调 */
  const releaseRecordingResources = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    const recorder = mediaRecorderRef.current
    if (recorder) {
      recorder.onstop = null // 阻止 stopRecording 的转写回调在关闭后继续跑
      if (recorder.state !== 'inactive') {
        try { recorder.stop() } catch { /* ignore */ }
      }
      recorder.stream.getTracks().forEach((t) => t.stop())
      mediaRecorderRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsRecording(false)
  }, [])

  // P0：弹窗关闭（含点遮罩/Esc/取消）时必须停录音释放麦克风
  useEffect(() => {
    if (!open) releaseRecordingResources()
  }, [open, releaseRecordingResources])

  // 组件卸载兜底
  useEffect(() => () => releaseRecordingResources(), [releaseRecordingResources])

  const startCloudRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
      }

      recorder.start(1000)
      setUsingLocalAsr(false)
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)
    } catch {
      setError('无法访问麦克风，请使用文本输入方式')
    }
  }, [])

  const startBrowserRecording = useCallback(async () => {
    if (!SpeechRecognitionAPI) {
      await startCloudRecording()
      return
    }
    try {
      const recognition = new SpeechRecognitionAPI()
      recognition.lang = 'zh-CN'
      recognition.continuous = true
      recognition.interimResults = true
      recognitionRef.current = recognition

      let finalTranscript = transcript

      recognition.onresult = (event: any) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += t
          } else {
            interim += t
          }
        }
        setTranscript(finalTranscript + interim)
      }

      recognition.onerror = async (event: any) => {
        console.error('Speech recognition error', event.error)
        recognitionRef.current = null
        setIsRecording(false)
        setUsingLocalAsr(false)
        if (timerRef.current) clearInterval(timerRef.current)

        if (event.error === 'network') {
          setLocalAsrUnavailable(true)
          setError('浏览器内置识别在当前网络不可用，1秒后将自动切换为云端录音...')
          setTimeout(() => {
            setError('')
            startCloudRecording()
          }, 1200)
        } else if (event.error === 'not-allowed') {
          setError('麦克风权限被拒绝')
        } else if (event.error === 'no-speech') {
          setError('未检测到语音，请重试')
        } else {
          setError('语音识别出错: ' + event.error)
        }
      }

      recognition.onend = () => {
        recognitionRef.current = null
        setIsRecording(false)
        setUsingLocalAsr(false)
        if (timerRef.current) clearInterval(timerRef.current)
      }

      recognition.start()
      setUsingLocalAsr(true)
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)
    } catch {
      setError('无法启动浏览器语音识别，尝试云端模式...')
      await startCloudRecording()
    }
  }, [transcript, startCloudRecording])

  const startRecording = useCallback(async () => {
    if (SpeechRecognitionAPI && !localAsrUnavailable) {
      await startBrowserRecording()
    } else {
      await startCloudRecording()
    }
  }, [localAsrUnavailable, startBrowserRecording, startCloudRecording])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
      if (timerRef.current) clearInterval(timerRef.current)
      setIsRecording(false)
      setUsingLocalAsr(false)
      return
    }

    const recorder = mediaRecorderRef.current
    if (!recorder) return

    const stopPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        resolve(blob)
      }
    })

    recorder.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setIsRecording(false)

    stopPromise.then(async (blob) => {
      setError('')
      try {
        const token = localStorage.getItem('token')
        const API_BASE = import.meta.env.VITE_API_URL || ''
        const formData = new FormData()
        formData.append('file', blob, 'recording.webm')

        const res = await fetch(`${API_BASE}/api/visits/transcribe`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        })

        if (!res.ok) throw new Error('转写失败')
        const data = await res.json()
        if (!data.success) throw new Error(data.error || '转写失败')

        setTranscript(data.data.text)
      } catch (err) {
        setError((err as Error).message || '语音转写失败，请手动输入文本')
      }
    })
  }, [])

  const handleExtract = async () => {
    if (!transcript.trim()) return
    setStep('extracting')
    setError('')
    setPrepData(undefined)
    try {
      const data = await post<ExtractedVisit>('/api/visits/extract', { transcript: transcript.trim() })
      setExtracted(data)
      setStep('preview')
    } catch (err) {
      setError((err as Error).message || '提取失败')
      setStep('record')
    }
  }

  const handleCreate = async () => {
    if (!extracted.projectId || !extracted.summary) {
      setError('请填写关联商机和拜访摘要')
      return
    }
    // AI 提取产物可能带 null / 非法日期，落库前统一规范化（zod optional 只认 undefined）
    const parsedTime = extracted.visitTime ? new Date(extracted.visitTime) : null
    const visit = await create.mutateAsync({
      projectId: extracted.projectId,
      summary: extracted.summary,
      visitType: extracted.visitType || 'offline',
      visitTime:
        parsedTime && !Number.isNaN(parsedTime.getTime())
          ? parsedTime.toISOString()
          : new Date().toISOString(),
      contactName: extracted.contactName || undefined,
      contactPosition: extracted.contactPosition || undefined,
      nextAction: extracted.nextAction || undefined,
      nextActionDeadline: extracted.nextActionDeadline || undefined,
    })
    if (visit?.id) {
      try {
        await post('/api/visits/' + visit.id + '/stage', { stage: 'REVIEWING' })
      } catch {
        // ignore stage advance error
      }
    }
    handleReset()
    onClose()
  }

  const handleReset = () => {
    releaseRecordingResources()
    draft.clear()
    setPendingDraft(null)
    setStep('record')
    setTranscript('')
    setExtracted({})
    setError('')
    setRecordingTime(0)
    setUsingLocalAsr(false)
    lastPrepProjectId.current = undefined
    setPrepData(undefined)
  }

  useEffect(() => {
    if (extracted.projectId && extracted.projectId !== lastPrepProjectId.current) {
      lastPrepProjectId.current = extracted.projectId
      prep.mutate(extracted.projectId, {
        onSuccess: (prepResult) => setPrepData(prepResult),
      })
    } else if (!extracted.projectId) {
      lastPrepProjectId.current = undefined
      setPrepData(undefined)
    }
  }, [extracted.projectId, prep])

  const fetchCopilot = async () => {
    const text = transcript.trim()
    if (text.length < 30) return
    setCopilotLoading(true)
    try {
      const token = localStorage.getItem('token')
      const API_BASE = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${API_BASE}/api/visits/copilot-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ transcript: text, projectId: extracted.projectId }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const insights: Array<{ type: string; content: string }> = []
      let done = false
      while (!done) {
        const chunk = await reader.read()
        done = chunk.done
        if (done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const item = JSON.parse(data)
              if (item.type !== 'noop' && item.type !== 'error') insights.push(item)
            } catch {
              // ignore
            }
          }
        }
      }
      setCopilotInsights(insights)
    } catch {
      // ignore
    } finally {
      setCopilotLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <Modal open={open} onClose={onClose} title="语音录入拜访">
      {pendingDraft && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs text-text-secondary">
            检测到有未提交的草稿（转写 {pendingDraft.transcript.trim().length} 字）
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90"
            >
              恢复
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="rounded-lg px-2.5 py-1 text-xs text-text-tertiary hover:bg-surface-elevated"
            >
              丢弃
            </button>
          </div>
        </div>
      )}
      {step === 'record' && (
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3 py-4">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`flex h-16 w-16 items-center justify-center rounded-full transition-all ${
                isRecording
                  ? 'bg-danger text-white animate-pulse'
                  : 'bg-primary text-white hover:bg-primary/90'
              }`}
            >
              {isRecording ? <Square size={24} /> : <Mic size={24} />}
            </button>
            <p className="text-sm text-text-secondary">
              {isRecording ? `录音中 ${formatTime(recordingTime)}` : '点击开始录音'}
            </p>
            {SpeechRecognitionAPI && !isRecording && !localAsrUnavailable && (
              <p className="flex items-center gap-1 text-xs text-success">
                <Sparkles size={12} />
                浏览器内置免费识别已就绪（Chrome/Edge）
              </p>
            )}
            {localAsrUnavailable && !isRecording && (
              <p className="text-xs text-warning">当前网络不支持浏览器内置识别，已切换为云端 ASR</p>
            )}
            {!SpeechRecognitionAPI && !isRecording && (
              <p className="text-xs text-text-tertiary">当前浏览器不支持本地识别，将使用云端 ASR</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              或直接输入拜访记录文本
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
              placeholder="例如：今天去了清华大学实验室管理处，和李处长线下沟通了智慧实验室管理系统的需求，对方表示预算已经批复，预计两周内启动招标..."
            />
          </div>

          {transcript.trim().length >= 30 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={fetchCopilot}
                disabled={copilotLoading}
                className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-xs font-medium text-white hover:bg-secondary/90 disabled:opacity-50"
              >
                {copilotLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                获取实时洞察
              </button>
              {copilotInsights.length > 0 && (
                <div className="rounded-lg border border-secondary/20 bg-secondary/5 p-2 space-y-1">
                  {copilotInsights.map((item, i) => (
                    <p key={i} className="text-[10px] text-text-secondary">
                      {item.type === 'keyPoint' ? '🔑' : item.type === 'riskAlert' ? '⚠️' : '💡'} {item.content}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleExtract}
              disabled={!transcript.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Wand2 size={16} />
              AI 提取
            </button>
          </div>
        </div>
      )}

      {step === 'extracting' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-sm text-text-secondary">AI 正在分析拜访内容并提取关键信息...</p>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          {extracted.projectName && !extracted.projectId && (
            <div className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
              未找到匹配的商机「{extracted.projectName}」，请手动选择或先创建商机
            </div>
          )}

          {/* Visit Preparation */}
          {prepData && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium text-primary">拜访准备 · {prepData.currentStage}</p>
                {extracted.projectId && (
                  <button
                    type="button"
                    onClick={() => sendAiPrompt(`帮我准备下次拜访，项目ID是${extracted.projectId}`)}
                    className="flex items-center gap-1 rounded-lg bg-primary px-2 py-0.5 text-[10px] font-medium text-white hover:bg-primary/90 transition-colors"
                  >
                    <Sparkles size={10} /> AI深度准备
                  </button>
                )}
              </div>

              {prepData.backgroundSummary && (
                <div>
                  <p className="text-[10px] font-medium text-text-tertiary">客户背景</p>
                  <p className="whitespace-pre-wrap text-[10px] text-text-secondary">{prepData.backgroundSummary}</p>
                </div>
              )}

              {prepData.contactIntel && (
                <div>
                  <p className="text-[10px] font-medium text-text-tertiary">联系人情报</p>
                  <p className="whitespace-pre-wrap text-[10px] text-text-secondary">{prepData.contactIntel}</p>
                </div>
              )}

              <p className="text-xs text-text-secondary">目标：{prepData.objective}</p>
              {prepData.missingFields.length > 0 && (
                <div>
                  <p className="text-[10px] text-warning">需确认：{prepData.missingFields.join('、')}</p>
                </div>
              )}
              {prepData.suggestedQuestions.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-medium text-text-tertiary">建议话术</p>
                  {prepData.suggestedQuestions.slice(0, 3).map((q, i) => (
                    <p key={i} className="text-[10px] text-text-secondary">• {q}</p>
                  ))}
                </div>
              )}
              {prepData.riskAlerts.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-medium text-warning">风险预警</p>
                  {prepData.riskAlerts.slice(0, 2).map((r, i) => (
                    <p key={i} className="text-[10px] text-warning">• {r}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-text-secondary">关联商机 *</label>
              <select
                value={extracted.projectId || ''}
                onChange={(e) => {
                  const p = projectOptions.find((x) => x.id === e.target.value)
                  setExtracted({
                    ...extracted,
                    projectId: e.target.value || undefined,
                    projectName: p?.name || extracted.projectName,
                  })
                }}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none focus:border-primary"
              >
                <option value="">
                  {extracted.projectName ? `未匹配「${extracted.projectName}」，请选择` : '请选择商机'}
                </option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.company?.name ? `${p.company.name} · ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">拜访时间</label>
              <input
                type="datetime-local"
                value={extracted.visitTime ? extracted.visitTime.slice(0, 16) : ''}
                onChange={(e) => setExtracted({ ...extracted, visitTime: new Date(e.target.value).toISOString() })}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">拜访方式</label>
              <div className="flex gap-2">
                {(['offline', 'online', 'phone'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setExtracted({ ...extracted, visitType: t })}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                      extracted.visitType === t
                        ? 'bg-primary text-white'
                        : 'border border-border bg-surface text-text-secondary hover:bg-surface-elevated'
                    }`}
                  >
                    {t === 'offline' ? '线下' : t === 'online' ? '线上' : '电话'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">联系人</label>
              <input
                value={extracted.contactName || ''}
                onChange={(e) => setExtracted({ ...extracted, contactName: e.target.value })}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
                placeholder="姓名"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">职位</label>
              <input
                value={extracted.contactPosition || ''}
                onChange={(e) => setExtracted({ ...extracted, contactPosition: e.target.value })}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
                placeholder="如：处长、主任"
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-text-secondary">拜访摘要 *</label>
              {(extracted.summary || '').trim() && (
                <button
                  type="button"
                  onClick={() => sendAiPrompt(`分析这次拜访质量：${extracted.summary}`)}
                  className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-0.5 text-[10px] font-medium text-white hover:bg-secondary/90 transition-colors"
                >
                  <Sparkles size={10} /> AI分析质量
                </button>
              )}
            </div>
            <textarea
              value={extracted.summary || ''}
              onChange={(e) => setExtracted({ ...extracted, summary: e.target.value })}
              rows={4}
              className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
              placeholder="拜访内容摘要..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">下一步行动</label>
              <input
                value={extracted.nextAction || ''}
                onChange={(e) => setExtracted({ ...extracted, nextAction: e.target.value })}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
                placeholder="如：准备方案PPT"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">截止时间</label>
              <input
                type="datetime-local"
                value={extracted.nextActionDeadline ? extracted.nextActionDeadline.slice(0, 16) : ''}
                onChange={(e) => setExtracted({ ...extracted, nextActionDeadline: new Date(e.target.value).toISOString() })}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none focus:border-primary"
              />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
            >
              <RotateCcw size={16} />
              重新录入
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={create.isPending || !extracted.projectId || !extracted.summary}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              {create.isPending ? '保存中...' : '确认保存'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
