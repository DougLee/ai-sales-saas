import { useState, useEffect, useMemo } from 'react'
import { KeyRound, Map as MapIcon, Check, Circle } from 'lucide-react'
import { useCreateLead, useUpdateLead, type Lead } from '../../hooks/use-leads.js'
import { isValidPhone, isValidEmail } from '@ai-sales/shared'
import { toast } from '../../lib/toast.js'
import { useFormDraft } from '../../hooks/use-form-draft.js'
import Modal from '../ui/modal.js'
import { FormInput, FormSelect, FormTextarea } from '../ui/form.js'
import CompanySelect from './company-select.js'
import PhoneInput from './phone-input.js'
import { calculateLeadScorePreview, checkConvertReadiness5, elementGaps } from '../../lib/lead-scoring.js'

/**
 * 新建线索表单（ADR-0002 / 设计稿 20260813）：人·事·财三分区 + 右侧实时四维评分。
 * 表单收集的是"信号"不是"答案"：建档最小集（客户+名称+联系人+电话+需求方向），
 * 缺口显性化引导（虚线黄底），保存后后端自动落规则分。
 */

const sourceOptions = [
  { value: 'visit_discovery', label: '拜访发现' },
  { value: 'cold_call', label: '电话开发' },
  { value: 'referral', label: '转介绍' },
  { value: 'exhibition', label: '展会活动' },
  { value: 'official_website', label: '官网咨询' },
  { value: 'ai_collected', label: '小销助手收集' },
  { value: 'partner', label: '合作伙伴' },
  { value: 'online', label: '线上推广' },
  { value: 'other', label: '其他' },
]

const budgetSignalOptions = [
  { value: '', label: '毫无提及' },
  { value: 'mentioned', label: '有提及（未谈金额）' },
  { value: 'range', label: '已知大致范围' },
  { value: 'confirmed', label: '预算已确认' },
]

const budgetSourceOptions = ['', '常规教学经费', '专项经费', '需申请']

const timelineTierOptions = ['', '明确（已知时间节点）', '大致（本学期/年内）']

const contactRoleOptions = ['', '关系切入者', '重要影响力者', '决策者']

const personalityOptions = ['', '老虎型 — 重结果', '孔雀型 — 重关系', '猫头鹰型 — 重数据', '考拉型 — 重稳定']

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
  contactRole: string
  personality: string
  notes: string
  decisionMaker: string
  decisionChain: string
  requirements: string
  timeline: string
  competitors: string
  budgetSignal: string
  budget: string
  budgetSource: string
}

function emptyDraft(companyId = ''): LeadDraft {
  return {
    companyId, name: '', source: 'visit_discovery', contactName: '', contactPhone: '',
    contactPosition: '', contactEmail: '', contactRole: '', personality: '', notes: '',
    decisionMaker: '', decisionChain: '', requirements: '', timeline: '', competitors: '',
    budgetSignal: '', budget: '', budgetSource: '',
  }
}

function draftHasContent(d: LeadDraft): boolean {
  return !!(d.name || d.notes || d.requirements || d.contactName || d.contactPhone)
}

export default function LeadForm({ open, onClose, initialData, prefilledCompanyId }: LeadFormProps) {
  const [companyId, setCompanyId] = useState(prefilledCompanyId || '')
  const [name, setName] = useState('')
  const [source, setSource] = useState('visit_discovery')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactPosition, setContactPosition] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactRole, setContactRole] = useState('')
  const [personality, setPersonality] = useState('')
  const [notes, setNotes] = useState('')

  // 人·事·财 三维度信号
  const [decisionMaker, setDecisionMaker] = useState('')
  const [decisionChain, setDecisionChain] = useState('')
  const [requirements, setRequirements] = useState('')
  const [timeline, setTimeline] = useState('')
  const [competitors, setCompetitors] = useState('')
  const [budgetSignal, setBudgetSignal] = useState('')
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
    setContactRole(d.contactRole || '')
    setPersonality(d.personality || '')
    setNotes(d.notes)
    setDecisionMaker(d.decisionMaker)
    setDecisionChain(d.decisionChain)
    setRequirements(d.requirements)
    setTimeline(d.timeline)
    setCompetitors(d.competitors || '')
    setBudgetSignal(d.budgetSignal || '')
    setBudget(d.budget)
    setBudgetSource(d.budgetSource)
  }

  // 每次打开都重置；新建时检测未提交草稿
  useEffect(() => {
    if (!open) return
    if (initialData) {
      applyDraft({
        companyId: initialData.companyId || prefilledCompanyId || '',
        name: initialData.name || '',
        source: initialData.source || 'visit_discovery',
        contactName: initialData.contactName || '',
        contactPhone: initialData.contactPhone || '',
        contactPosition: initialData.contactPosition || '',
        contactEmail: initialData.contactEmail || '',
        contactRole: (initialData.humanInfo?.contactRole as string) || '',
        personality: (initialData.humanInfo?.personality as string) || '',
        notes: initialData.notes || '',
        decisionMaker: initialData.humanInfo?.decisionMaker || '',
        decisionChain: initialData.humanInfo?.decisionChain || '',
        requirements: initialData.businessInfo?.requirements || '',
        timeline: initialData.businessInfo?.timeline || '',
        competitors: (initialData.businessInfo?.competitors as string) || '',
        budgetSignal: (initialData.financeInfo?.budgetSignal as string) || '',
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

  // 草稿自动保存（防抖 500ms，编辑模式不存）
  useEffect(() => {
    if (!open || initialData?.id || pendingDraft) return
    draft.save({
      companyId, name, source, contactName, contactPhone, contactPosition, contactEmail,
      contactRole, personality, notes, decisionMaker, decisionChain, requirements, timeline,
      competitors, budgetSignal, budget, budgetSource,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingDraft, companyId, name, source, contactName, contactPhone, contactPosition, contactEmail, contactRole, personality, notes, decisionMaker, decisionChain, requirements, timeline, competitors, budgetSignal, budget, budgetSource])

  // 右侧实时评分（与后端规则分同口径）
  const scoreInput = useMemo(() => ({
    contactName, contactPhone, contactPosition, contactEmail, source,
    humanInfo: { decisionMaker, decisionChain },
    businessInfo: { requirements, timeline },
    financeInfo: { budget, budgetSource, budgetSignal },
  }), [contactName, contactPhone, contactPosition, contactEmail, source, decisionMaker, decisionChain, requirements, timeline, budget, budgetSource, budgetSignal])
  const breakdown = useMemo(() => calculateLeadScorePreview(scoreInput), [scoreInput])
  const readiness = useMemo(() => checkConvertReadiness5({
    score: breakdown.total,
    contactPhone, contactEmail,
    requirements,
    decisionMaker,
    budgetSignal, budget, budgetSource,
  }), [breakdown.total, contactPhone, contactEmail, requirements, decisionMaker, budgetSignal, budget, budgetSource])
  const gaps = useMemo(() => elementGaps(breakdown), [breakdown])

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
        contactRole: contactRole || undefined,
        personality: personality || undefined,
      },
      businessInfo: {
        requirements: requirements || undefined,
        timeline: timeline || undefined,
        competitors: competitors || undefined,
      },
      financeInfo: {
        budget: budget || undefined,
        budgetSource: budgetSource || undefined,
        budgetSignal: budgetSignal || undefined,
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

  // 分区样式：人琥珀 / 事蓝 / 财绿（呼应设计稿三色）
  const secHead = (cls: string) =>
    `flex items-center gap-2 rounded-t-lg px-3 py-2 text-sm font-bold ${cls}`
  const secBadge = 'flex h-5 w-5 items-center justify-center rounded text-xs text-white'
  const secPts = 'ml-auto rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-semibold'
  const keyMark = <KeyRound size={10} className="ml-1 inline text-warning" aria-label="转化门禁字段" />

  const dims = [
    { nm: '联系方式', v: breakdown.contactCompleteness, max: 25 },
    { nm: '需求明确度', v: breakdown.needClarity, max: 30 },
    { nm: '预算信号', v: breakdown.budgetSignal, max: 25 },
    { nm: '决策链', v: breakdown.decisionChainClarity, max: 20 },
  ]

  return (
    <Modal open={open} onClose={onClose} title={initialData ? '编辑线索' : '新建线索'} panelClassName="w-full max-w-4xl rounded-2xl border border-border bg-surface p-6 shadow-xl">
      <form onSubmit={handleSubmit}>
        {pendingDraft && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs text-text-secondary">检测到有未提交的草稿{pendingDraft.name ? `：${pendingDraft.name}` : ''}</span>
            <div className="flex gap-2">
              <button type="button" onClick={handleRestoreDraft} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90">恢复</button>
              <button type="button" onClick={handleDiscardDraft} className="rounded-lg px-2.5 py-1 text-xs text-text-tertiary hover:bg-surface-elevated">丢弃</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
          {/* ===== 左：表单 ===== */}
          <div className="max-h-[64vh] space-y-4 overflow-y-auto pr-1">
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
              placeholder="客户名 - 机会一句话，如：河南大学 - 人工智能通识课建设意向"
            />

            {/* 人 */}
            <section className="overflow-hidden rounded-xl border border-border">
              <div className={secHead('bg-warning/15 text-[#b45309]')}>
                <span className={`${secBadge} bg-[#b45309]`}>人</span>关键对接人
                <span className="text-xs font-normal opacity-80">— 现在搭上线的是谁？</span>
                <span className={secPts}>{breakdown.contactCompleteness + breakdown.decisionChainClarity} / 45 分</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-3">
                <FormInput label={<span className="text-xs">联系人姓名 *</span>} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="姓名" />
                <FormInput label={<span className="text-xs">职务 / 部门</span>} value={contactPosition} onChange={(e) => setContactPosition(e.target.value)} placeholder="如：教务处 副处长" />
                <div>
                  <PhoneInput label="联系电话 *" value={contactPhone} onChange={setContactPhone} placeholder="手机号码" />
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-text-tertiary"><KeyRound size={10} className="text-warning" /> 转化门禁：至少一个有效联系方式</p>
                </div>
                <FormInput label={<span className="text-xs">微信 / 邮箱</span>} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="选填" />
                <FormSelect label={<span className="text-xs">角色定位</span>} value={contactRole} onChange={(e) => setContactRole(e.target.value)}>
                  <option value="">还不清楚</option>
                  {contactRoleOptions.filter(Boolean).map((r) => <option key={r} value={r}>{r}</option>)}
                </FormSelect>
                <FormSelect label={<span className="text-xs">性格类型（选填）</span>} value={personality} onChange={(e) => setPersonality(e.target.value)}>
                  <option value="">待观察</option>
                  {personalityOptions.filter(Boolean).map((p) => <option key={p} value={p}>{p}</option>)}
                </FormSelect>
                <div className={`col-span-2 rounded-lg border px-3 py-2 ${decisionMaker || decisionChain ? '' : 'border-dashed border-warning/60 bg-warning/5'}`}>
                  <p className="mb-1 text-xs font-medium text-text-secondary">决策链线索{keyMark}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput label="" size="sm" value={decisionMaker} onChange={(e) => setDecisionMaker(e.target.value)} placeholder="拍板人是谁？（如：分管副校长）" />
                    <FormInput label="" size="sm" value={decisionChain} onChange={(e) => setDecisionChain(e.target.value)} placeholder="这类项目谁牵头？（如：信息办牵头）" />
                  </div>
                  <p className="mt-1 text-[11px] text-text-tertiary"><KeyRound size={10} className="inline text-warning" /> 转化门禁：需识别决策链关键角色——现在不知道没关系，这就是下一步要问出来的</p>
                </div>
              </div>
            </section>

            {/* 事 */}
            <section className="overflow-hidden rounded-xl border border-border">
              <div className={secHead('bg-primary/10 text-primary')}>
                <span className={`${secBadge} bg-primary`}>事</span>需求信号
                <span className="text-xs font-normal opacity-80">— 什么事让你觉得这有戏？</span>
                <span className={secPts}>{breakdown.needClarity} / 30 分</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-3">
                <div className="col-span-2">
                  <p className="mb-1 text-xs font-medium text-text-secondary">需求方向 / 痡点 *{keyMark}</p>
                  <textarea
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    rows={2}
                    placeholder="客户原话最佳，形容词不算数。如：教务处想推 AI 通识课，缺课程资源和实验平台"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
                  />
                  <p className="mt-1 text-[11px] text-text-tertiary"><KeyRound size={10} className="inline text-warning" /> 转化门禁：需求方向需明确</p>
                </div>
                <FormSelect label={<span className="text-xs">期望解决时间</span>} value={timeline} onChange={(e) => setTimeline(e.target.value)}>
                  <option value="">未知</option>
                  {timelineTierOptions.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
                </FormSelect>
                <FormSelect label={<span className="text-xs">线索来源</span>} value={source} onChange={(e) => setSource(e.target.value)}>
                  {sourceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </FormSelect>
                <FormInput label={<span className="text-xs">竞品动向（选填）</span>} value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="是否已有竞品接触？谁的方案在桌上？" />
              </div>
            </section>

            {/* 财 */}
            <section className="overflow-hidden rounded-xl border border-border">
              <div className={secHead('bg-success/10 text-success')}>
                <span className={`${secBadge} bg-success`}>财</span>预算信号
                <span className="text-xs font-normal opacity-80">— 钱的事，有苗头吗？（初期多半未知，不急）</span>
                <span className={secPts}>{breakdown.budgetSignal} / 25 分</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-3">
                <FormSelect label={<span className="text-xs">预算信号</span>} value={budgetSignal} onChange={(e) => setBudgetSignal(e.target.value)}>
                  {budgetSignalOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </FormSelect>
                <FormSelect label={<span className="text-xs">经费来源（选填）</span>} value={budgetSource} onChange={(e) => setBudgetSource(e.target.value)}>
                  {budgetSourceOptions.map((o) => <option key={o} value={o}>{o || '未知'}</option>)}
                </FormSelect>
                <FormInput label={<span className="text-xs">预算金额（已知时填）</span>} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="如：50 万" />
                <div className="col-span-2">
                  <FormTextarea label={<span className="text-xs">备注</span>} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="其他背景：人脉、历史接触、学校近况…" />
                </div>
              </div>
            </section>
          </div>

          {/* ===== 右：实时评分面板 ===== */}
          <aside className="space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-3.5">
            <div>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-extrabold ${breakdown.total >= 60 ? 'text-warning' : breakdown.total >= 40 ? 'text-primary' : 'text-text-tertiary'}`}>{breakdown.total}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{breakdown.grade} 级 · 预估</span>
              </div>
              <p className="mt-0.5 text-[11px] text-text-tertiary">线索质量分（随填写实时更新，保存后自动落库）</p>
            </div>

            <div className="space-y-1.5">
              {dims.map((d) => (
                <div key={d.nm} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 text-text-secondary">{d.nm}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-border">
                    <i
                      className={`block h-full rounded ${d.v / d.max >= 0.6 ? 'bg-success' : d.v / d.max >= 0.3 ? 'bg-warning' : 'bg-danger'}`}
                      style={{ width: `${(d.v / d.max) * 100}%` }}
                    />
                  </span>
                  <span className="w-11 shrink-0 text-right text-text-tertiary">{d.v}/{d.max}</span>
                </div>
              ))}
            </div>

            {gaps.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
                <b className="text-warning">距 A 级还差 {Math.max(60 - breakdown.total, 0)} 分，缺口在：</b>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-text-secondary">
                  {gaps.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-xs font-bold text-text-primary">转化门禁进度 <span className="rounded-md bg-violet-50 px-1.5 text-[11px] font-medium text-violet-700">5 条硬条件</span></p>
              <ul className="mt-1.5 space-y-1 text-xs leading-5 text-text-secondary">
                <li className="flex items-center gap-1">{(contactPhone ? isValidPhone(contactPhone) : !!contactEmail) ? <Check size={11} className="text-success" /> : <Circle size={11} className="text-text-tertiary" />} 有效联系方式</li>
                <li className="flex items-center gap-1">{requirements.trim() ? <Check size={11} className="text-success" /> : <Circle size={11} className="text-text-tertiary" />} 需求方向明确</li>
                <li className="flex items-center gap-1">{breakdown.total >= 60 ? <Check size={11} className="text-success" /> : <Circle size={11} className="text-text-tertiary" />} 评分 ≥ 60（当前 {breakdown.total}）</li>
                <li className="flex items-center gap-1"><Circle size={11} className="text-text-tertiary" /> 至少一次有效跟进（建档后跟进即计）</li>
                <li className="flex items-center gap-1">{decisionMaker.trim() ? <Check size={11} className="text-success" /> : <Circle size={11} className="text-text-tertiary" />} 识别决策链关键角色</li>
              </ul>
              {readiness.softHints.length > 0 && (
                <p className="mt-1.5 border-t border-border pt-1.5 text-[11px] text-warning">软提示：{readiness.softHints[0]}</p>
              )}
            </div>

            <div className="rounded-lg bg-primary/5 px-3 py-2 text-[11px] text-text-secondary">
              <p className="flex items-center gap-1 font-bold text-primary"><MapIcon size={11} /> 7 步路线图 · 当前 {breakdown.total >= 60 && decisionMaker.trim() ? 'Step 6 门禁检查' : requirements.trim() ? 'Step 3+ 确认需求/决策链' : 'Step 1-2 信息验证'}</p>
              <p className="mt-1">下一步建议：{decisionMaker.trim() ? '跟进一次（电话/拜访）点亮「有效跟进」→ 补预算信号' : '首次触达时探听决策链（"这类项目一般谁牵头？"）'}</p>
            </div>
          </aside>
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
          <span className="mr-auto text-xs text-text-tertiary">
            保存即建档为 <b className="text-text-secondary">{breakdown.grade} 级线索</b>，进入培育轨道（补充信息后分数自动更新）
          </span>
          <button type="button" onClick={onClose} className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors">取消</button>
          <button
            type="submit"
            disabled={(initialData?.id ? update.isPending : create.isPending) || !name.trim() || !companyId}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {initialData?.id ? (update.isPending ? '保存中...' : '保存') : (create.isPending ? '创建中...' : '创建线索')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
