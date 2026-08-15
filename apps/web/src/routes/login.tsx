import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../lib/toast.js'

export default function Login() {
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 已登录用户访问 /login 直接进入系统（避免反复登录同一账号）
  useEffect(() => {
    if (localStorage.getItem('token')) navigate('/', { replace: true })
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const url = isRegister ? '/api/auth/register' : '/api/auth/login'
    const body = isRegister
      ? { email, password, name, ...(tenantName ? { tenantName } : {}) }
      : { email, password }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || '请求失败')
        return
      }
      // 兼容旧架构后端（扁平响应）和新架构后端（嵌套 data）
      const token = data.data?.token || data.token
      const kicked = data.data?.kicked || false
      if (!token) {
        setError('登录响应格式异常，未获取到 token')
        return
      }
      localStorage.setItem('token', token)
      if (kicked) {
        toast.info('您已在其他设备登录，该设备会话已失效')
      }
      // replace：登录页不进历史栈，登录后按返回不会退回登录页
      navigate('/', { replace: true })
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-white">
            AI
          </div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {isRegister ? '创建账户' : '欢迎回来'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {isRegister ? '开启 AI 驱动的销售管理' : '登录您的 AI 销售系统'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">姓名</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
                  placeholder="您的姓名"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">企业名称（选填）</label>
                <input
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
                  placeholder="不填则加入默认团队"
                />
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">邮箱</label>
            <input
              type="email" autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
              placeholder="name@company.com"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">密码</label>
            <input
              type="password" autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
              placeholder="至少6位字符"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl bg-primary text-sm font-medium text-white transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? '处理中...' : isRegister ? '注册' : '登录'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-sm text-text-secondary hover:text-primary"
          >
            {isRegister ? '已有账户？登录' : '没有账户？注册'}
          </button>
        </div>
      </div>
    </div>
  )
}
