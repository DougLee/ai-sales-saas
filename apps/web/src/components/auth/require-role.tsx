import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import type { UserRole } from '@ai-sales/shared'
import { useAuthUser } from '../../hooks/use-auth.js'
import { toast } from '../../lib/toast.js'

interface RequireRoleProps {
  roles: UserRole[]
  fallback?: React.ReactNode
  children: React.ReactNode
}

/**
 * 路由级权限守卫：sidebar 只藏入口，这里拦路由本身（手输 URL 也进不来）。
 * roles 应传模块级常量（稳定引用），否则 toast 副作用会随每次渲染触发。
 * 未登录一律弹回 /login（作为全局守卫时的兜底）；有登录态但角色不符则弹回工作台并提示。
 */
export default function RequireRole({ roles, fallback, children }: RequireRoleProps) {
  const { data: user, isLoading } = useAuthUser()
  const denied = !!user && !roles.includes(user.role as UserRole)

  useEffect(() => {
    if (denied) toast.info('您没有权限访问该页面')
  }, [denied])

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  if (denied) {
    if (fallback) return <>{fallback}</>
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
