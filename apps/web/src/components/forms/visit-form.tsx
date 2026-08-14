import { useState, useEffect } from 'react'
import { Sparkles, Plus } from 'lucide-react'
import { useCreateVisit, useUpdateVisit, useVisitPrep, type Visit, type VisitPrep } from '../../hooks/use-visits.js'
import { useContacts, useCreateContact } from '../../hooks/use-contacts.js'
import { useProjects, useProject } from '../../hooks/use-projects.js'
import { useCompanies } from '../../hooks/use-companies.js'
import Modal from '../ui/modal.js'
import { FormTextarea } from '../ui/form.js'
import CompanySelect from './company-select.js'
import DateField from './date-field.js'
import { toLocalInputValue, localInputToISO } from '../../lib/datetime.js'
import { sendAiPrompt } from '../../lib/ai-prompt.js'

interface VisitFormProps {
  open: boolean
  onClose: (created?: boolean) => void
  initialData?: Partial<Visit>
}

export default function VisitForm({ open, onClose, initialData }: VisitFormProps) {
  const [companyId, setCompanyId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [summary, setSummary] = useState('')
  const [visitType, setVisitType] = useState<'online' | 'offline' | 'phone'>('offline')
  const [visitTime, setVisitTime] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPosition, setContactPosition] = useState('')
  const [contactRole, setContactRole] = useState('')
  const [selectedContactId, setSelectedContactId] = useState('')

  const [showAddContact, setShowAddContact] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactPosition, setNewContactPosition] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')

  const create = useCreateVisit()
  const update = useUpdateVisit()
  const prep = useVisitPrep()
  const createContact = useCreateContact()
  const [prepData, setPrepData] = useState<VisitPrep | undefined>(undefined)

  const { data: projectsData } = useProjects()
  const projects = projectsData?.items || []
  const { data: companiesData } = useCompanies({})
  const companies = companiesData?.items || []

  const { data: projectDetail } = useProject(projectId || undefined)
  const companyName = companies.find((c) => c.id === companyId)?.name || projectDetail?.company?.name || ''

  const { data: contactsData } = useContacts(companyName ? { company: companyName } : undefined)
  const contacts = contactsData?.items || []

  const projectOptions = projects.filter((p) => p.company?.id === companyId)

  useEffect(() => {
    if (initialData) {
      const initCompanyId = initialData.companyId || initialData.company?.id || ''
      setCompanyId(initCompanyId)
      setProjectId(initialData.projectId || '')
      setSummary(initialData.summary || '')
      setVisitType(initialData.visitType || 'offline')
      // toLocalInputValue：ISO 是 UTC 串，直接 slice 塞 datetime-local 会差一个时区
      setVisitTime(initialData.visitTime ? toLocalInputValue(initialData.visitTime) : '')
      setContactName(initialData.contactName || '')
      setContactPosition(initialData.contactPosition || '')
      setContactRole(initialData.contactRole || '')
      setSelectedContactId('')
    } else {
      setCompanyId('')
      setProjectId('')
      setSummary('')
      setVisitType('offline')
      setVisitTime('')
      setContactName('')
      setContactPosition('')
      setContactRole('')
      setSelectedContactId('')
    }
    setPrepData(undefined)
    setShowAddContact(false)
    setNewContactName('')
    setNewContactPosition('')
    setNewContactPhone('')
  }, [initialData])

  useEffect(() => {
    if (projectId) {
      prep.mutate(projectId, {
        onSuccess: (data) => setPrepData(data),
      })
    } else {
      setPrepData(undefined)
    }
    // prep 是 useMutation 返回的 stable mutate 对象，无需加入依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // 选择商机后自动带出客户
  useEffect(() => {
    if (projectDetail?.company?.id) {
      setCompanyId(projectDetail.company.id)
    }
  }, [projectDetail])

  // 切换客户时，清空不匹配的商机和联系人
  useEffect(() => {
    if (companyId && projectId && !projectOptions.some((p) => p.id === projectId)) {
      setProjectId('')
      setPrepData(undefined)
    }
    if (selectedContactId && !contacts.some((c) => c.id === selectedContactId)) {
      setSelectedContactId('')
      setContactName('')
      setContactPosition('')
      setContactRole('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, projectOptions, contacts])

  const handleContactChange = (contactId: string) => {
    setSelectedContactId(contactId)
    const contact = contacts.find((c) => c.id === contactId)
    if (contact) {
      setContactName(contact.name)
      setContactPosition(contact.position || '')
      setContactRole(contact.decisionRole || '')
    } else {
      setContactName('')
      setContactPosition('')
      setContactRole('')
    }
  }

  const handleCreateContact = async () => {
    if (!newContactName.trim() || !companyId) return
    const result = await createContact.mutateAsync({
      name: newContactName.trim(),
      position: newContactPosition.trim() || undefined,
      phone: newContactPhone.trim() || undefined,
      companyId,
    })
    setShowAddContact(false)
    setNewContactName('')
    setNewContactPosition('')
    setNewContactPhone('')
    if (result.item) {
      setSelectedContactId(result.item.id)
      setContactName(result.item.name)
      setContactPosition(result.item.position || '')
      setContactRole(result.item.decisionRole || '')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      companyId,
      projectId: projectId || undefined,
      summary: summary || undefined,
      visitType,
      visitTime: localInputToISO(visitTime) || new Date().toISOString(),
      contactName: contactName || undefined,
      contactPosition: contactPosition || undefined,
      contactRole: contactRole || undefined,
    }
    if (initialData?.id) {
      await update.mutateAsync({ id: initialData.id, data: payload })
      onClose()
    } else {
      await create.mutateAsync(payload)
      onClose(true)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initialData ? '编辑拜访' : '手动录入拜访'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <CompanySelect
          value={companyId}
          onChange={setCompanyId}
          disabled={!!initialData?.company?.id}
          required
          label="所属客户"
          placeholder="请选择所属客户"
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">关联商机（可选）</label>
          {initialData?.project?.name ? (
            <div className="flex h-10 items-center rounded-xl border border-border bg-surface px-4 text-sm text-text-primary">
              {initialData.project.name}
            </div>
          ) : (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!companyId}
              className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">{companyId ? '暂不关联商机' : '请先选择客户'}</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Visit Preparation */}
        {prepData && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-primary">拜访准备 · {prepData.currentStage}</p>
              {projectId && (
                <button
                  type="button"
                  onClick={() => sendAiPrompt(`帮我准备下次拜访，项目ID是${projectId}`)}
                  className="flex items-center gap-1 rounded-lg bg-primary px-2 py-0.5 text-[10px] font-medium text-white hover:bg-primary/90 transition-colors"
                >
                  <Sparkles size={10} /> AI深度准备
                </button>
              )}
            </div>
            <p className="text-xs text-text-secondary">目标：{prepData.objective}</p>
            {prepData.missingFields.length > 0 && (
              <div className="mt-1.5">
                <p className="text-[10px] text-warning">需确认：{prepData.missingFields.join('、')}</p>
              </div>
            )}
            {prepData.suggestedQuestions.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                <p className="text-[10px] text-text-tertiary">建议话术：</p>
                {prepData.suggestedQuestions.slice(0, 3).map((q, i) => (
                  <p key={i} className="text-[10px] text-text-secondary">• {q}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-text-secondary">关联联系人</label>
            {companyId && !showAddContact && (
              <button
                type="button"
                onClick={() => {
                  setShowAddContact(true)
                  setSelectedContactId('')
                  setContactName('')
                  setContactPosition('')
                  setContactRole('')
                }}
                className="flex items-center gap-0.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Plus size={12} /> 添加联系人
              </button>
            )}
          </div>

          {!showAddContact ? (
            <>
              <select
                value={selectedContactId}
                onChange={(e) => handleContactChange(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none focus:border-primary"
              >
                <option value="">不关联联系人</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.position ? `(${c.position})` : ''}
                  </option>
                ))}
              </select>
              {contactName && (
                <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-text-secondary">
                  <span>{contactName}</span>
                  {contactPosition && <span className="text-text-tertiary">· {contactPosition}</span>}
                  {contactRole && <span className="text-text-tertiary">· {contactRole}</span>}
                </div>
              )}
              {companyId && contacts.length === 0 && (
                <p className="mt-1 text-xs text-text-tertiary">
                  该客户暂无联系人，可点击右上角添加
                </p>
              )}
            </>
          ) : (
            <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
              <input
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                required
                placeholder="姓名 *"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newContactPosition}
                  onChange={(e) => setNewContactPosition(e.target.value)}
                  placeholder="职位"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
                />
                <input
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="电话"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddContact(false)
                    setNewContactName('')
                    setNewContactPosition('')
                    setNewContactPhone('')
                  }}
                  className="rounded-lg border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreateContact}
                  disabled={createContact.isPending || !newContactName.trim()}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {createContact.isPending ? '创建中...' : '创建并关联'}
                </button>
              </div>
            </div>
          )}
        </div>

        <DateField
          label="拜访时间"
          mode="datetime"
          value={visitTime}
          onChange={setVisitTime}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">拜访方式</label>
          <div className="flex gap-2">
            {(['offline', 'online', 'phone'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setVisitType(t)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  visitType === t
                    ? 'bg-primary text-white'
                    : 'border border-border bg-surface text-text-secondary hover:bg-surface-elevated'
                }`}
              >
                {t === 'offline' ? '线下' : t === 'online' ? '线上' : '电话'}
              </button>
            ))}
          </div>
        </div>
        <FormTextarea
          label={
            <span className="flex items-center justify-between">
              <span>拜访摘要</span>
              {summary.trim() && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    sendAiPrompt(`分析这次拜访质量：${summary}`)
                  }}
                  className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-0.5 text-[10px] font-medium text-white hover:bg-secondary/90 transition-colors"
                >
                  <Sparkles size={10} /> AI分析质量
                </button>
              )}
            </span>
          }
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="记录拜访要点..."
        />
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={(initialData?.id ? update.isPending : create.isPending) || !companyId}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {initialData?.id ? (update.isPending ? '保存中...' : '保存') : (create.isPending ? '创建中...' : '创建')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
