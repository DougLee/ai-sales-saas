import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { post } from '../../lib/api.js'
import { toast } from '../../lib/toast.js'
import Modal from '../ui/modal.js'
import { FormInput } from '../ui/form.js'
import DateField from './date-field.js'

/**
 * 复盘录入（V6.1 §5.2 节点3：拜访记录 → POST /api/visits/:id/log）
 *
 * 原始输入是评分的唯一依据（AI 扩写不计分）。
 * 三种方式：个人复盘速记 / 线上会议纪要 / 现场录音转写（需客户同意）。
 */

const RAW_INPUT_TYPES = [
  { value: 'recap', label: '个人复盘速记' },
  { value: 'meeting', label: '线上会议纪要' },
  { value: 'note', label: '随手笔记' },
  { value: 'transcript', label: '现场录音转写', needConsent: true },
] as const

export default function LogVisitForm({
  visitId,
  open,
  onClose,
}: {
  visitId: string
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [rawInputType, setRawInputType] = useState<string>('recap')
  const [rawInput, setRawInput] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextActionDeadline, setNextActionDeadline] = useState('')
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const needConsent = rawInputType === 'transcript'
  const canSubmit = rawInput.trim().length >= 10 && (!needConsent || consentConfirmed) && !submitting

  const reset = () => {
    setRawInput('')
    setNextAction('')
    setNextActionDeadline('')
    setConsentConfirmed(false)
    setRawInputType('recap')
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      const result = await post<{ analysisStatus?: string }>(`/api/visits/${visitId}/log`, {
        rawInput: rawInput.trim(),
        rawInputType,
        ...(nextAction.trim() ? { nextAction: nextAction.trim() } : {}),
        ...(nextActionDeadline ? { nextActionDeadline: new Date(nextActionDeadline).toISOString() } : {}),
        ...(needConsent ? { consentConfirmed: true } : {}),
      })
      toast.success(result.analysisStatus === 'done' ? '复盘已录入，AI 分析完成' : '复盘已录入')
      qc.invalidateQueries({ queryKey: ['visits'] })
      qc.invalidateQueries({ queryKey: ['visit-closure', visitId] })
      qc.invalidateQueries({ queryKey: ['confirmations'] })
      reset()
      onClose()
    } catch (err) {
      toast.error((err as Error).message || '录入失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="录入拜访复盘">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs text-text-tertiary">记录方式</label>
          <div className="grid grid-cols-2 gap-2">
            {RAW_INPUT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setRawInputType(t.value)}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  rawInputType === t.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-text-secondary hover:bg-surface-elevated'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-text-tertiary">
            原始记录（评分的唯一依据，请写清：需求/预算/决策人/下一步）
          </label>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={6}
            placeholder="今天拜访了……确认需求是……预算约……下周三前……"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-text-tertiary">{rawInput.trim().length} 字（至少 10 字）</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label={<span className="text-xs text-text-tertiary">下一步行动（可选）</span>}
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="提交方案初稿"
          />
          <DateField
            label="完成时限（可选）"
            mode="date"
            disablePast
            value={nextActionDeadline}
            onChange={setNextActionDeadline}
          />
        </div>

        {needConsent && (
          <label className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => setConsentConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            已告知客户并获得录音/转写同意（合规要求，未勾选无法提交）
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-elevated"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            提交复盘
          </button>
        </div>
      </div>
    </Modal>
  )
}
