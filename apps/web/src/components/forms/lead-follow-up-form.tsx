import { useState } from 'react'
import { useLeadFollowUp } from '../../hooks/use-leads.js'
import Modal from '../ui/modal.js'
import { FormSelect, FormTextarea, FormInput } from '../ui/form.js'
import DateField from './date-field.js'
import { localInputToISO } from '../../lib/datetime.js'

const channelOptions = [
  { value: 'phone', label: '电话' },
  { value: 'wechat', label: '微信' },
  { value: 'email', label: '邮件' },
  { value: 'visit', label: '拜访' },
  { value: 'other', label: '其他' },
]

interface LeadFollowUpFormProps {
  open: boolean
  onClose: () => void
  leadId: string
}

export default function LeadFollowUpForm({ open, onClose, leadId }: LeadFollowUpFormProps) {
  const [content, setContent] = useState('')
  const [channel, setChannel] = useState('phone')
  const [outcome, setOutcome] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextActionDeadline, setNextActionDeadline] = useState('')

  const followUp = useLeadFollowUp()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await followUp.mutateAsync({
      id: leadId,
      data: {
        content,
        channel,
        outcome: outcome || undefined,
        nextAction: nextAction || undefined,
        // 后端 zod 要求 ISO datetime（带时区），原始 datetime-local 值会被 400 拒掉
        nextActionDeadline: localInputToISO(nextActionDeadline),
      },
    })
    setContent('')
    setChannel('phone')
    setOutcome('')
    setNextAction('')
    setNextActionDeadline('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="记录跟进">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormTextarea
          label="沟通内容"
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="本次沟通要点..."
        />

        <FormSelect label="渠道" required value={channel} onChange={(e) => setChannel(e.target.value)}>
          {channelOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </FormSelect>

        <FormTextarea
          label="客户反馈"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          rows={2}
          placeholder="客户的反应、态度、关键信息..."
        />

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="下次行动"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="如：发送方案"
          />
          <DateField
            label="截止时间"
            mode="datetime"
            disablePast
            value={nextActionDeadline}
            onChange={setNextActionDeadline}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={followUp.isPending || !content.trim()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {followUp.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
