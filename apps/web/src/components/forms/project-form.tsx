import { useState, useEffect } from 'react'
import { useCreateProject, useUpdateProject, type Project } from '../../hooks/use-projects.js'
import Modal from '../ui/modal.js'
import { FormInput, FormSelect, FormTextarea } from '../ui/form.js'
import CompanySelect from './company-select.js'
import DateField from './date-field.js'
import { toLocalInputValue, localInputToISO } from '../../lib/datetime.js'
import { toast } from '../../lib/toast.js'

interface ProjectFormProps {
  open: boolean
  onClose: () => void
  initialData?: Partial<Project>
  prefilledCompanyId?: string
}

export default function ProjectForm({ open, onClose, initialData, prefilledCompanyId }: ProjectFormProps) {
  const [companyId, setCompanyId] = useState(prefilledCompanyId || initialData?.company?.id || '')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [milestone, setMilestone] = useState(0)
  const [urgency, setUrgency] = useState('MEDIUM')
  const [notes, setNotes] = useState('')
  const [nextFollowUp, setNextFollowUp] = useState('')

  const create = useCreateProject()
  const update = useUpdateProject()

  useEffect(() => {
    if (initialData) {
      setCompanyId(initialData.company?.id || prefilledCompanyId || '')
      setName(initialData.name || '')
      setAmount(initialData.amount != null ? String(initialData.amount) : '')
      setMilestone(initialData.milestone ?? 0)
      setUrgency(initialData.urgency || 'MEDIUM')
      setNotes(initialData.notes || '')
      // toLocalInputValue：ISO 是 UTC 串，直接 slice 塞 datetime-local 会差一个时区
      setNextFollowUp(initialData.nextFollowUp ? toLocalInputValue(initialData.nextFollowUp) : '')
    } else {
      setCompanyId(prefilledCompanyId || '')
      setName('')
      setAmount('')
      setMilestone(0)
      setUrgency('MEDIUM')
      setNotes('')
      setNextFollowUp('')
    }
  }, [initialData, prefilledCompanyId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountNum = amount ? Number(amount) : undefined
    if (amountNum != null && amountNum < 0) {
      toast('预估金额不能为负数', 'error')
      return
    }
    const payload: Record<string, unknown> = {
      name,
      companyId,
      amount: amountNum,
      milestone,
      urgency: urgency as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      notes: notes || undefined,
    }
    const followUpISO = localInputToISO(nextFollowUp)
    if (followUpISO) {
      payload.nextFollowUp = followUpISO
    }
    if (initialData?.id) {
      await update.mutateAsync({ id: initialData.id, data: payload })
    } else {
      await create.mutateAsync(payload)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={initialData ? '编辑商机' : '新建商机'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <CompanySelect
          value={companyId}
          onChange={setCompanyId}
          disabled={!!prefilledCompanyId || !!initialData?.company?.id}
          required
          label="所属客户"
          placeholder="请选择所属客户"
        />

        <FormInput
          label="商机名称"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="项目名称"
        />
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="预估金额（万元）"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
          <FormSelect label="当前里程碑" value={milestone} onChange={(e) => setMilestone(Number(e.target.value))}>
            <option value={0}>初识客户</option>
            <option value={1}>明确痛点</option>
            <option value={2}>明确需求</option>
            <option value={3}>明确经费</option>
            <option value={4}>明确方案</option>
            <option value={5}>明确价格</option>
            <option value={6}>协助采购</option>
            <option value={7}>招标确认</option>
            <option value={8}>投标中标</option>
          </FormSelect>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">紧急度</label>
          <div className="flex gap-2">
            {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUrgency(u)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  urgency === u
                    ? 'bg-primary text-white'
                    : 'border border-border bg-surface text-text-secondary hover:bg-surface-elevated'
                }`}
              >
                {u === 'LOW' ? '低' : u === 'MEDIUM' ? '中' : u === 'HIGH' ? '高' : '紧急'}
              </button>
            ))}
          </div>
        </div>
        <FormTextarea
          label="备注"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="补充信息..."
        />
        <DateField
          label="下次跟进时间"
          mode="datetime"
          value={nextFollowUp}
          onChange={setNextFollowUp}
        />
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
            disabled={(initialData?.id ? update.isPending : create.isPending) || !name.trim() || !companyId}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {initialData?.id ? (update.isPending ? '保存中...' : '保存') : (create.isPending ? '创建中...' : '创建')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
