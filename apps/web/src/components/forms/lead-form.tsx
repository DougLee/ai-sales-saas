import { useState, useEffect } from 'react'
import { useCreateLead, useUpdateLead, type Lead } from '../../hooks/use-leads.js'
import { isValidPhone, isValidEmail } from '@ai-sales/shared'
import { toast } from '../../lib/toast.js'
import { useFormDraft } from '../../hooks/use-form-draft.js'
import Modal from '../ui/modal.js'
import { FormInput, FormSelect, FormTextarea } from '../ui/form.js'
import CompanySelect from './company-select.js'
import PhoneInput from './phone-input.js'

const sourceOptions = [
  { value: 'cold_call', label: ' cold call' },
  { value: 'referral', label: '客户推荐' },
  { value: 'exhibition', label: '展会活动' },
  { value: 'online', label: '线上推广' },
  { value: 'official_website', label: '官网咨询' },
  { value: 'partner', label: '合作伙伴' },
  { value: 'other', label: '其他' },
]

interface LeadFormProps {
  open: boolean
  onClose: () => void
  initialData?: Partial<Lead>
  prefilledCompanyId?: string
}

/** 草稿快照：新建线索的全部表单字段 */
interface LeadDraft {
  companyId: string
  name: string
  source: string
  contactName: string
  contactPhone: string
  contactPosition: string
  contactEmail: string
  notes: string
  decisionMaker: string
  decisionChain: string
  requirements: string
  timeline: string
  budget: string
  budgetSource: string
}

function emptyDraft(companyId = ''): LeadDraft {
  return {
    companyId, name: '', source: 'cold_call', contactName: '', contactPhone: '',
    contactPosition: '', contactEmail: '', notes: '', decisionMaker: '', decisionChain: '',
    requirements: '', timeline: '', budget: '', budgetSource: '',
  }
}

function draftHasContent(d: LeadDraft): boolean {
  return !!(d.name || d.notes || d.requirements || d.contactName || d.contactPhone)
}

export default function LeadForm({ open, onClose, initialData, prefilledCompanyId }: LeadFormProps) {
  const [companyId, setCompanyId] = useState(prefilledCompanyId || '')
  const [name, setName] = useState('')
  const [source, setSource] = useState('cold_call')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactPosition, setContactPosition] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [notes, setNotes] = useState('')

  // 三维度信息
  const [decisionMaker, setDecisionMaker] = useState('')
  const [decisionChain, setDecisionChain] = useState('')
  const [requirements, setRequirements] = useState('')
  const [timeline, setTimeline] = useState('')
  const [budget, setBudget] = useState('')
  const [budgetSource, setBudgetSource] = useState('')

  const create = useCreateLead()
  const update = useUpdateLead()

  // P2 草稿机制：新建线索自动存草稿，打开时提示恢复；编辑模式不用草稿
  const draftKey = `lead-form:${initialData?.id || 'new'}`
  const draft = useFormDraft<LeadDraft>(draftKey, open && !initialData?.id)
  const [pendingDraft, setPendingDraft] = useState<LeadDraft | null>(null)

  const applyDraft = (d: LeadDraft) => {
    setCompanyId(d.companyId)
    setName(d.name)
    setSource(d.source)
    setContactName(d.contactName)
    setContactPhone(d.contactPhone)
    setContactPosition(d.contactPosition)
    setContactEmail(d.contactEmail)
    setNotes(d.notes)
    setDecisionMaker(d.decisionMaker)
    setDecisionChain(d.decisionChain)
    setRequirements(d.requirements)
    setTimeline(d.timeline)
    setBudget(d.budget)
    setBudgetSource(d.budgetSource)
  }

  // 每次打开都重置（修"取消重开残留上次脏数据"）；新建时检测未提交草稿
  useEffect(() => {
    if (!open) return
    if (initialData) {
      applyDraft({
        companyId: initialData.companyId || prefilledCompanyId || '',
        name: initialData.name || '',
        source: initialData.source || 'cold_call',
        contactName: initialData.contactName || '',
        contactPhone: initialData.contactPhone || '',
        contactPosition: initialData.contactPosition || '',
        contactEmail: initialData.contactEmail || '',
        notes: initialData.notes || '',
        decisionMaker: initialData.humanInfo?.decisionMaker || '',
        decisionChain: initialData.humanInfo?.decisionChain || '',
        requirements: initialData.businessInfo?.requirements || '',
        timeline: initialData.businessInfo?.timeline || '',
        budget: initialData.financeInfo?.budget || '',
        budgetSource: initialData.financeInfo?.budgetSource || '',
      })
      setPendingDraft(null)
    } else {
      const base = emptyDraft(prefilledCompanyId || '')
      applyDraft(base)
      const saved = draft.restore()
      setPendingDraft(saved && draftHasContent(saved) ? { ...base, ...saved } : null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData, prefilledCompanyId])

  // 草稿自动保存（防抖 500ms，编辑模式不存；草稿待确认期间不覆盖旧草稿）
  useEffect(() => {
    if (!open || initialData?.id || pendingDraft) return
    draft.save({
      companyId, name, source, contactName, contactPhone, contactPosition, contactEmail,
      notes, decisionMaker, decisionChain, requirements, timeline, budget, budgetSource,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingDraft, companyId, name, source, contactName, contactPhone, contactPosition, contactEmail, notes, decisionMaker, decisionChain, requirements, timeline, budget, budgetSource])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidPhone(contactPhone)) {
      toast('请输入正确的手机号或座机号', 'error')
      return
    }
    if (!isValidEmail(contactEmail)) {
      toast('请输入正确的邮箱地址', 'error')
      return
    }
    const payload = {
      companyId,
      name,
      source,
      contactName: contactName || undefined,
      contactPhone: contactPhone || undefined,
      contactPosition: contactPosition || undefined,
      contactEmail: contactEmail || undefined,
      notes: notes || undefined,
      humanInfo: {
        decisionMaker: decisionMaker || undefined,
        decisionChain: decisionChain || undefined,
      },
      businessInfo: {
        requirements: requirements || undefined,
        timeline: timeline || undefined,
      },
      financeInfo: {
        budget: budget || undefined,
        budgetSource: budgetSource || undefined,
      },
    }
    if (initialData?.id) {
      await update.mutateAsync({ id: initialData.id, data: payload })
    } else {
      await create.mutateAsync(payload)
      draft.clear()
    }
    onClose()
  }

  const handleRestoreDraft = () => {
    if (pendingDraft) applyDraft(pendingDraft)
    setPendingDraft(null)
  }

  const handleDiscardDraft = () => {
    draft.clear()
    setPendingDraft(null)
  }

  return (
    <Modal open={open} onClose={onClose} title={initialData ? '编辑线索' : '新建线索'}>
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        {pendingDraft && (
          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs text-text-secondary">检测到有未提交的草稿{pendingDraft.name ? `：${pendingDraft.name}` : ''}</span>
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

        <CompanySelect
          value={companyId}
          onChange={setCompanyId}
          disabled={!!prefilledCompanyId}
          required
          label="所属客户"
          placeholder="请选择所属客户"
        />

        <FormInput
          label="线索名称"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="学校或企业名称"
        />

        <FormSelect label="来源" value={source} onChange={(e) => setSource(e.target.value)}>
          {sourceOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </FormSelect>

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="联系人"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="姓名"
          />
          <FormInput
            label="职位"
            value={contactPosition}
            onChange={(e) => setContactPosition(e.target.value)}
            placeholder="如：处长、主任"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <PhoneInput
            label="电话"
            value={contactPhone}
            onChange={setContactPhone}
            placeholder="手机号码"
          />
          <FormInput
            label="邮箱"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="email@example.com"
          />
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">人 — 决策链</p>
          <FormInput
            size="sm"
            label={<span className="text-xs">关键决策人</span>}
            value={decisionMaker}
            onChange={(e) => setDecisionMaker(e.target.value)}
            placeholder="如：信息化处长"
          />
          <FormInput
            size="sm"
            label={<span className="text-xs">决策链说明</span>}
            value={decisionChain}
            onChange={(e) => setDecisionChain(e.target.value)}
            placeholder="如：信息中心提需求，分管校长拍板"
          />
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">事 — 需求与场景</p>
          <FormTextarea
            label={<span className="text-xs">需求描述</span>}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            rows={2}
            placeholder="客户的核心需求..."
          />
          <FormInput
            size="sm"
            label={<span className="text-xs">采购时间</span>}
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            placeholder="如：2026 年春季学期"
          />
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">财 — 预算信号</p>
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              size="sm"
              label={<span className="text-xs">预算金额</span>}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="如：50 万"
            />
            <FormInput
              size="sm"
              label={<span className="text-xs">预算来源</span>}
              value={budgetSource}
              onChange={(e) => setBudgetSource(e.target.value)}
              placeholder="如：教务处经费"
            />
          </div>
        </div>

        <FormTextarea
          label="备注"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="补充信息..."
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
