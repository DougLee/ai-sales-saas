import { useState } from 'react'
import { X, Search, Loader2, Check, Users, Shield, User, Eye, Building, Trash2, Power } from 'lucide-react'
import { useUsers, useUpdateUser, useDeleteUser, type UserItem } from '../../hooks/use-users.js'
import { useAuthUser } from '../../hooks/use-auth.js'
import { USER_ROLES } from '@ai-sales/shared'
import type { UserRole } from '@ai-sales/shared'
import { toast } from '../../lib/toast.js'
import { useConfirmDialog } from '../../hooks/use-confirm-dialog.js'
import DialogBase from '../ui/dialog-base.js'

interface MemberManagerProps {
  open: boolean
  onClose: () => void
}

const roleIcons: Record<UserRole, typeof User> = {
  SUPER_ADMIN: Shield,
  TENANT_ADMIN: Shield,
  DEPT_HEAD: Building,
  SALES: User,
  VIEWER: Eye,
}

export default function MemberManager({ open, onClose }: MemberManagerProps) {
  const { data, isLoading } = useUsers({ pageSize: 100 })
  const { data: authUser } = useAuthUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<UserRole | ''>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const confirmDialog = useConfirmDialog()

  if (!open) return null

  const items = data?.items || []
  const filtered = items.filter((u) => {
    const matchesSearch =
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = !filterRole || u.role === filterRole
    return matchesSearch && matchesRole
  })

  const handleRoleChange = async (user: UserItem, newRole: UserRole) => {
    if (user.id === authUser?.id) {
      toast.error('不能修改自己的角色')
      return
    }
    setEditingId(user.id)
    try {
      await updateUser.mutateAsync({ id: user.id, body: { role: newRole } })
      toast.success(`${user.name} 的角色已更新`)
    } catch (err) {
      toast.error((err as Error).message || '更新失败')
    } finally {
      setEditingId(null)
    }
  }

  const handleStatusToggle = async (user: UserItem) => {
    if (user.id === authUser?.id) {
      toast.error('不能停用自己')
      return
    }
    const next = user.status === 'active' ? 'inactive' : 'active'
    const action = next === 'active' ? '启用' : '停用'
    if (!(await confirmDialog.confirm({
      title: `${action}成员`,
      description: `确定要${action} ${user.name} 的账号吗？${next === 'inactive' ? '停用后该成员将无法登录系统。' : ''}`,
      confirmLabel: action,
      danger: next === 'inactive',
    }))) return
    setEditingId(user.id)
    try {
      await updateUser.mutateAsync({ id: user.id, body: { status: next } })
      toast.success(`${user.name} 已${action}`)
    } catch (err) {
      toast.error((err as Error).message || `${action}失败`)
    } finally {
      setEditingId(null)
    }
  }

  const handleDelete = async (user: UserItem) => {
    if (user.id === authUser?.id) {
      toast.error('不能删除自己')
      return
    }
    if (!(await confirmDialog.confirm({
      title: '删除成员',
      description: `确定要删除 ${user.name}（${user.email}）吗？此操作不可恢复。`,
      confirmLabel: '删除',
      danger: true,
    }))) return
    setEditingId(user.id)
    try {
      await deleteUser.mutateAsync({ id: user.id })
      toast.success(`${user.name} 已删除`)
    } catch (err) {
      toast.error((err as Error).message || '删除失败')
    } finally {
      setEditingId(null)
    }
  }

  const roleLabel = (role: UserRole) => USER_ROLES.find((r) => r.value === role)?.label || role

  return (
    <DialogBase
      open={open}
      onClose={onClose}
      label="成员与角色管理"
      panelClassName="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-surface shadow-xl"
    >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Users size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">成员与角色管理</h3>
              <p className="text-xs text-text-tertiary">共 {items.length} 位成员 · 仅管理员可调整角色</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索姓名或邮箱"
              className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2 text-sm text-text-primary outline-none focus:border-primary"
            />
          </div>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as UserRole | '')}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
          >
            <option value="">全部角色</option>
            {USER_ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-text-tertiary">
              <Users size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">未找到成员</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-elevated/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">成员</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">角色</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">状态</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">加入时间</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">最后登录</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((u) => {
                    const isSelf = u.id === authUser?.id
                    const RoleIcon = roleIcons[u.role]
                    return (
                      <tr key={u.id} className="hover:bg-surface-elevated/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                              {u.name.slice(0, 1)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-text-primary">{u.name}</span>
                                {isSelf && (
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                    当前用户
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-text-tertiary">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <RoleIcon size={14} className="text-text-tertiary" />
                            {isSelf ? (
                              <span className="text-text-primary">{roleLabel(u.role)}</span>
                            ) : (
                              <select
                                value={u.role}
                                disabled={editingId === u.id || updateUser.isPending}
                                onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                                className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-text-primary outline-none focus:border-primary disabled:opacity-50"
                              >
                                {USER_ROLES.map((r) => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                              </select>
                            )}
                            {editingId === u.id && <Loader2 size={14} className="animate-spin text-primary" />}
                            {editingId !== u.id && updateUser.isPending && updateUser.variables?.id === u.id && (
                              <Loader2 size={14} className="animate-spin text-primary" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                              u.status === 'active'
                                ? 'bg-success/10 text-success'
                                : 'bg-text-tertiary/10 text-text-tertiary'
                            }`}
                          >
                            {u.status === 'active' && <Check size={12} />}
                            {u.status === 'active' ? '正常' : '已停用'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '从未登录'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStatusToggle(u)}
                              disabled={isSelf || editingId === u.id || updateUser.isPending || deleteUser.isPending}
                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                u.status === 'active'
                                  ? 'bg-warning/10 text-warning hover:bg-warning/20'
                                  : 'bg-success/10 text-success hover:bg-success/20'
                              }`}
                            >
                              {editingId === u.id && updateUser.isPending && updateUser.variables?.id === u.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Power size={12} />
                              )}
                              {u.status === 'active' ? '停用' : '启用'}
                            </button>
                            <button
                              onClick={() => handleDelete(u)}
                              disabled={isSelf || editingId === u.id || updateUser.isPending || deleteUser.isPending}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
                            >
                              {editingId === u.id && deleteUser.isPending && deleteUser.variables?.id === u.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
          >
            关闭
          </button>
        </div>
      {confirmDialog.dialog}
    </DialogBase>
  )
}
