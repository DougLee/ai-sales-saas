import { useState, useEffect } from 'react'
import { useCreateCompany, useUpdateCompany, type Company } from '../../hooks/use-companies.js'
import { isValidPhone } from '@ai-sales/shared'
import { toast } from '../../lib/toast.js'
import Modal from '../ui/modal.js'
import { FormInput, FormSelect, FormTextarea } from '../ui/form.js'
import PhoneInput from './phone-input.js'

interface CustomerFormProps {
  open: boolean
  onClose: () => void
  initialData?: Partial<Company>
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
  const [notes, setNotes] = useState('')

  const create = useCreateCompany()
  const update = useUpdateCompany()

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
      setNotes('')
    }
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidPhone(contactPhone)) {
      toast('请输入正确的手机号或座机号', 'error')
      return
    }
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
      notes: notes || undefined,
    }
    if (initialData?.id) {
      await update.mutateAsync({ id: initialData.id, data: payload })
    } else {
      await create.mutateAsync(payload)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={initialData ? '编辑客户' : '新建客户'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput
          label="客户名称"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="学校或企业名称"
        />
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="行业"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="如：教育、医疗"
          />
          <FormInput
            label="规模"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
            placeholder="如：500人、省属高校"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="地区"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="如：北京、上海"
          />
          <FormSelect label="客户等级" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">未分级</option>
            <option value="A">A - 战略客户</option>
            <option value="B">B - 重点客户</option>
            <option value="C">C - 普通客户</option>
            <option value="D">D - 潜在客户</option>
          </FormSelect>
        </div>
        <FormInput
          label="地址"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="详细地址"
        />
        <FormInput
          label="官网"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.com"
        />
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="联系人"
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
            placeholder="姓名"
          />
          <PhoneInput
            label="电话"
            value={contactPhone}
            onChange={setContactPhone}
            placeholder="手机号码"
          />
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
            disabled={(initialData?.id ? update.isPending : create.isPending) || !name.trim()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {initialData?.id ? (update.isPending ? '保存中...' : '保存') : (create.isPending ? '创建中...' : '创建')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
