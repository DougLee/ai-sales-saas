import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Users, Phone, Mail, Building2, Briefcase, User } from 'lucide-react'
import { useContacts, useContact, useDeleteContact, type Contact } from '../hooks/use-contacts.js'
import { useCompanies } from '../hooks/use-companies.js'
import { useDebouncedValue } from '../hooks/use-debounced-value.js'
import { useSearchParams } from 'react-router-dom'
import Drawer from '../components/ui/drawer.js'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/states.js'
import { PageHeader } from '../components/ui/page-header.js'
import { SectionCard } from '../components/ui/section-card.js'
import { StatusPill } from '../components/ui/status-pill.js'
import ContactFormDrawer from '../components/customers/contact-form-drawer.js'
import { roleMetaOf } from '../components/customers/roles.js'
import { useConfirmDialog } from '../hooks/use-confirm-dialog.js'

export default function Contacts() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [openForm, setOpenForm] = useState(false)
  const [editingItem, setEditingItem] = useState<Contact | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | undefined>(undefined)
  const [searchParams, setSearchParams] = useSearchParams()

  const { data, isLoading, error } = useContacts({ search: debouncedSearch })
  const { data: companiesData } = useCompanies({})
  // P1：详情走独立查询，操作后随 ['contact', id] 失效自动刷新
  const { data: detailItem } = useContact(detailId)

  const companies = companiesData?.items || []

  const contactId = searchParams.get('id')
  useEffect(() => {
    if (!contactId) return
    setDetailId(contactId)
    setSearchParams({}, { replace: true })
  }, [contactId, setSearchParams])
  const del = useDeleteContact()
  const confirmDialog = useConfirmDialog()

  const contacts = data?.items || []

  const handleEdit = (contact: Contact) => {
    setEditingItem(contact)
    setOpenForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog.confirm({
      title: '删除联系人',
      description: '删除后不可恢复，确定删除这位联系人吗？',
      confirmLabel: '删除',
      danger: true,
    }))) return
    del.mutate(id)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="联系人"
        subtitle="联系人管理（通常从客户列表进入）"
        actions={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索姓名、公司、电话..."
                className="h-10 rounded-xl border border-border bg-surface pl-9 pr-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
              />
            </div>
            <button
              onClick={() => { setEditingItem(undefined); setOpenForm(true) }}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Plus size={16} /> 新建联系人
            </button>
          </>
        }
      />

      <SectionCard
        title="联系人列表"
        actions={
          <span className="text-sm text-text-tertiary">
            {isLoading ? '加载中...' : `共 ${contacts.length} 位联系人`}
          </span>
        }
        padded={false}
      >

        {isLoading && <LoadingState />}

        {error && <ErrorState message={(error as Error).message || '加载失败'} />}

        {!isLoading && !error && contacts.length === 0 && (
          <EmptyState
            icon={Users}
            title="暂无联系人"
            description="手动录入或从知识库导入"
          />
        )}

        {!isLoading && !error && contacts.length > 0 && (
          <div className="divide-y divide-border border-t border-border">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-elevated/50 cursor-pointer"
                onClick={() => setDetailId(contact.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-inner bg-primary/10 text-primary">
                    <User size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{contact.name}</span>
                      {contact.decisionRole && (
                        <StatusPill tone={roleMetaOf(contact.decisionRole).tone}>
                          {roleMetaOf(contact.decisionRole).label}
                        </StatusPill>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-text-tertiary">
                      {contact.position && (
                        <span className="flex items-center gap-1">
                          <Briefcase size={10} /> {contact.position}
                        </span>
                      )}
                      {contact.company && (
                        <span className="flex items-center gap-1">
                          <Building2 size={10} /> {contact.company.name}
                        </span>
                      )}
                      {contact.department && (
                        <span>{contact.department}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {contact.phone && (
                    <span className="flex items-center gap-1 text-xs text-text-secondary">
                      <Phone size={12} /> {contact.phone}
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(contact) }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(contact.id) }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 合一表单（issue #43）：与客户列表条带共用同一表单；独立页需手动选所属客户 */}
      <ContactFormDrawer
        open={openForm}
        onClose={() => { setOpenForm(false); setEditingItem(undefined) }}
        initial={editingItem}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
      />

      {/* Detail Drawer */}
      <Drawer
        open={!!detailId}
        onClose={() => setDetailId(undefined)}
        title="联系人详情"
      >
        {detailId && !detailItem && <LoadingState />}
        {detailItem && (
          <div className="space-y-5 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <User size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-text-primary">{detailItem.name}</span>
                  {detailItem.decisionRole && (
                    <StatusPill tone={roleMetaOf(detailItem.decisionRole).tone}>
                      {roleMetaOf(detailItem.decisionRole).label}
                    </StatusPill>
                  )}
                </div>
                <p className="text-sm text-text-tertiary">{detailItem.position}{detailItem.department ? ` · ${detailItem.department}` : ''}{detailItem.company ? ` · ${detailItem.company.name}` : ''}</p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
              <h4 className="text-sm font-medium text-text-secondary">联系信息</h4>
              <div className="space-y-2 text-sm">
                {detailItem.phone && (
                  <div className="flex items-center gap-2 text-text-primary">
                    <Phone size={14} className="text-text-tertiary" /> {detailItem.phone}
                  </div>
                )}
                {detailItem.email && (
                  <div className="flex items-center gap-2 text-text-primary">
                    <Mail size={14} className="text-text-tertiary" /> {detailItem.email}
                  </div>
                )}
                {detailItem.wechat && (
                  <div className="flex items-center gap-2 text-text-primary">
                    <Users size={14} className="text-text-tertiary" /> 微信：{detailItem.wechat}
                  </div>
                )}
              </div>
            </div>

            {(detailItem.personalMotive || detailItem.roiConcern || detailItem.howToReach) && (
              <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
                <h4 className="text-sm font-medium text-text-secondary">决策画像</h4>
                <div className="space-y-2 text-sm">
                  {detailItem.personalMotive && (
                    <div>
                      <span className="text-xs text-text-tertiary">个人动机</span>
                      <p className="mt-0.5 text-text-primary">{detailItem.personalMotive}</p>
                    </div>
                  )}
                  {detailItem.roiConcern && (
                    <div>
                      <span className="text-xs text-text-tertiary">ROI关切</span>
                      <p className="mt-0.5 text-text-primary">{detailItem.roiConcern}</p>
                    </div>
                  )}
                  {detailItem.howToReach && (
                    <div>
                      <span className="text-xs text-text-tertiary">接触策略</span>
                      <p className="mt-0.5 text-text-primary">{detailItem.howToReach}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setDetailId(undefined); handleEdit(detailItem) }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-elevated"
              >
                <Pencil size={14} /> 编辑
              </button>
              <button
                onClick={() => { handleDelete(detailItem.id); setDetailId(undefined) }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-danger/20 bg-danger/5 py-2.5 text-sm font-medium text-danger hover:bg-danger/10"
              >
                <Trash2 size={14} /> 删除
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {confirmDialog.dialog}
    </div>
  )
}
