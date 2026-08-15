import { useState, useEffect, useMemo } from 'react'
import { Bot, Lightbulb } from 'lucide-react'
import { useCreateCompany, useUpdateCompany, type Company } from '../../hooks/use-companies.js'
import { isValidPhone } from '@ai-sales/shared'
import Modal from '../ui/modal.js'
import { FormInput, FormSelect, FormTextarea } from '../ui/form.js'
import PhoneInput from './phone-input.js'
import {
  INDUSTRY_OPTIONS,
  SCALE_OPTIONS,
  SOURCE_OPTIONS,
  LEVEL_OPTIONS,
} from '../../lib/company-options.js'

/**
 * 客户表单（ADR-0001 决策 4 / 设计稿 20260813）：四分组 + 两列栅格。
 * - 字段下拉化（行业/规模/来源/等级），历史自由文本值注入为额外 option 不丢数据
 * - 电话失焦实时校验、错误就地显示
 * - 完整度实时预览（表单内可贡献 50 分，其余 50 来自拜访/决策人/线索沉淀）
 * - AI 建档显示来源条；状态/负责人为展示项（状态流转走详情页，负责人由后端默认当前用户）
 * - 不做存草稿
 */

/** 地区预置（高教场景以省为主）；当前值不在列表时动态注入 */
const REGION_OPTIONS = [
  '河南省', '湖北省', '湖南省', '河北省', '山东省', '山西省',
  '陕西省', '安徽省', '江苏省', '浙江省', '广东省', '四川省', '北京市', '上海市',
]

interface CustomerFormProps {
  open: boolean
  onClose: () => void
  initialData?: Partial<Company>
}

/** 把不在预置清单里的存量值注入选项头（fallback 显示，不丢数据） */
function withFallback(options: readonly { value: string; label: string }[], current?: string) {
  if (current && !options.some((o) => o.value === current)) {
    return [{ value: current, label: `${current}（历史值）` }, ...options]
  }
  return options
}

function withPlainFallback(options: readonly string[], current?: string) {
  if (current && !options.includes(current)) return [current, ...options]
  return options
}

/** 表单内完整度预览：与后端 computeCompanyCompleteness 同口径的可填部分（50 分） */
function computeFormCompleteness(f: {
  industry: string; scale: string; region: string; level: string; contactPerson: string; contactPhone: string
}) {
  const base = [f.industry, f.scale, f.region, f.level].filter(Boolean).length * 5 // name 恒有 = 5
  const contact = f.contactPerson && f.contactPhone ? 25 : 0
  return Math.min(base + contact, 50)
}

export default function CustomerForm({ open, onClose, initialData }: CustomerFormProps) {
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [scale, setScale] = useState('')
  const [region, setRegion] = useState('')
  const [level, setLevel] = useState('')
  const [address, setAddress] = useState('')
  const [website, setWebsite] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [phoneValid, setPhoneValid] = useState(true)
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')

  const create = useCreateCompany()
  const update = useUpdateCompany()

  const isEdit = !!initialData?.id
  const isAiSourced = initialData?.source === 'ai_recommendation'
  const phoneInvalid = contactPhone !== '' && !phoneValid

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '')
      setIndustry(initialData.industry || '')
      setScale(initialData.scale || '')
      setRegion(initialData.region || '')
      setLevel(initialData.level || '')
      setAddress(initialData.address || '')
      setWebsite(initialData.website || '')
      setContactPerson(initialData.contactPerson || '')
      setContactPhone(initialData.contactPhone || '')
      setSource(initialData.source || '')
      setNotes(initialData.notes || '')
    } else {
      setName('')
      setIndustry('')
      setScale('')
      setRegion('')
      setLevel('')
      setAddress('')
      setWebsite('')
      setContactPerson('')
      setContactPhone('')
      setSource('')
      setNotes('')
    }
    setPhoneValid(true)
  }, [initialData])

  const preview = useMemo(
    () => computeFormCompleteness({ industry, scale, region, level, contactPerson, contactPhone }),
    [industry, scale, region, level, contactPerson, contactPhone],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (contactPhone && !isValidPhone(contactPhone)) return
    const payload = {
      name: name.trim(),
      industry: industry || undefined,
      scale: scale || undefined,
      region: region || undefined,
      level: level || undefined,
      address: address || undefined,
      website: website || undefined,
      contactPerson: contactPerson || undefined,
      contactPhone: contactPhone || undefined,
      source: source || undefined,
      notes: notes || undefined,
    }
    if (isEdit) {
      await update.mutateAsync({ id: initialData!.id!, data: payload })
    } else {
      await create.mutateAsync(payload)
    }
    onClose()
  }

  const sectionTitle = 'flex items-center gap-2 border-b-2 border-primary/10 pb-2 text-sm font-semibold text-text-primary'
  const sectionHint = 'ml-auto text-xs font-normal text-text-tertiary'
  const sectionIcon = 'flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary'

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '编辑客户' : '新建客户'}>
      <form onSubmit={handleSubmit} className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
        {/* AI 来源条：小销建档时提醒人工核实 */}
        {isAiSourced && (
          <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
            <Bot size={14} className="shrink-0" />
            本客户由「小销助手」从对话中收集，可信度：<b>中</b>，请核实补充后保存。
          </div>
        )}

        {/* ① 基本信息 */}
        <section className="space-y-3">
          <div className={sectionTitle}>
            <span className={sectionIcon}>①</span>基本信息
            <span className={sectionHint}>它是谁 —— 客户主档的核心身份</span>
          </div>
          <div>
            <FormInput
              label="客户名称"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="学校/企业全称，如：河南大学"
            />
            <p className="mt-1 flex items-center gap-1 text-[11px] text-text-tertiary">
              <Lightbulb size={11} /> 系统会自动查重，近似名称将在详情页提示合并
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormSelect label="行业" value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">请选择</option>
              {withFallback(INDUSTRY_OPTIONS, industry).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </FormSelect>
            <FormSelect label="客户等级" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">未分级</option>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </FormSelect>
            <FormSelect label="规模" value={scale} onChange={(e) => setScale(e.target.value)}>
              <option value="">请选择</option>
              {withFallback(SCALE_OPTIONS, scale).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </FormSelect>
            <FormSelect label="所在地区" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">请选择</option>
              {withPlainFallback(REGION_OPTIONS, region).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </FormSelect>
          </div>
        </section>

        {/* ② 联系信息 */}
        <section className="space-y-3">
          <div className={sectionTitle}>
            <span className={sectionIcon}>②</span>联系信息
            <span className={sectionHint}>首次触达的抓手</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="联系人"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="姓名"
            />
            <PhoneInput
              label="联系电话"
              value={contactPhone}
              onChange={setContactPhone}
              onValidChange={setPhoneValid}
              placeholder="手机号码"
            />
            <FormInput
              label="地址（选填）"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="详细地址"
            />
            <FormInput
              label="官网（选填）"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://"
            />
          </div>
        </section>

        {/* ③ 来源与归属 */}
        <section className="space-y-3">
          <div className={sectionTitle}>
            <span className={sectionIcon}>③</span>来源与归属
            <span className={sectionHint}>客户从哪来、归谁管</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormSelect label="客户来源" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">未记录</option>
              {withFallback(SOURCE_OPTIONS, source).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </FormSelect>
            <div>
              <FormInput
                label="负责人"
                value={initialData?.owner?.name || (isEdit ? (initialData?.ownerId ? '已指派' : '公海池') : '我（默认）')}
                onChange={() => {}}
                placeholder="我（默认）"
              />
              <p className="mt-1 text-[11px] text-text-tertiary">新建后由您负责；负责人变更走客户池的分配/认领</p>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-text-secondary">客户状态</p>
            <div className="flex gap-1.5" role="group" aria-label="客户状态">
              {[
                { key: 'target', label: '目标客户' },
                { key: 'following', label: '跟进中' },
                { key: 'won', label: '已成交' },
                { key: 'lost', label: '已流失' },
              ].map((s) => (
                <span
                  key={s.key}
                  className={`rounded-lg border px-3 py-1 text-xs ${
                    (initialData?.status || 'target') === s.key
                      ? 'border-primary bg-primary font-semibold text-white'
                      : 'border-border text-text-tertiary'
                  }`}
                >
                  {s.label}
                </span>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-text-tertiary">
              新建默认「目标客户」；建立线索后系统自动升级为「跟进中」，状态流转在详情页操作
            </p>
          </div>
        </section>

        {/* ④ 备注 */}
        <section className="space-y-3">
          <div className={sectionTitle}>
            <span className={sectionIcon}>④</span>备注
            <span className={sectionHint}>其他背景信息</span>
          </div>
          <FormTextarea
            label=""
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="补充信息：如客户近况、关注方向、人脉背景…"
          />
        </section>

        {/* 底部操作栏：完整度预览 + 取消/提交 */}
        <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-border bg-surface px-1 py-3">
          <span className="mr-auto text-xs text-text-tertiary">
            完整度预览：
            <b className={preview >= 40 ? 'text-success' : preview >= 20 ? 'text-warning' : 'text-danger'}>
              {preview}/50
            </b>
            （其余 50 分来自决策人识别、30 天内拜访与线索沉淀）
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={(isEdit ? update.isPending : create.isPending) || !name.trim() || phoneInvalid}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isEdit ? (update.isPending ? '保存中...' : '保存') : (create.isPending ? '创建中...' : '创建客户')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
