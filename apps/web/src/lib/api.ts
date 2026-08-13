import { toast } from './toast.js'

const API_BASE = import.meta.env.VITE_API_URL || ''

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  const method = options.method || 'GET'
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }
  if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
    headers['Content-Type'] = 'application/json'
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers })
  if (res.status === 401) {
    let message = '登录已过期，请重新登录'
    try {
      const json = await res.clone().json()
      const errData = json as Record<string, unknown>
      const errorObj = errData?.error as Record<string, string> | undefined
      if (errorObj?.code === 'SESSION_EXPIRED') {
        message = '您的账号已在其他设备登录，请重新登录'
      }
    } catch {
      // ignore parse error
    }
    localStorage.removeItem('token')
    toast.info(message)
    setTimeout(() => {
      window.location.href = '/login'
    }, 1500)
    throw new Error(message)
  }
  return res
}

function extractPayload<T>(json: unknown): T {
  if (typeof json !== 'object' || json === null) throw new Error('非法响应')
  const obj = json as Record<string, unknown>
  if (obj.success === false) {
    const err = obj.error
    let msg: string
    if (typeof err === 'string') {
      msg = err
    } else if (err && typeof err === 'object') {
      msg = (err as Record<string, unknown>).message as string || JSON.stringify(err)
    } else {
      msg = '请求失败'
    }
    throw new Error(msg)
  }
  if ('data' in obj) return obj.data as T
  const { success: _success, error: _error, ...rest } = obj
  return rest as T
}

export async function get<T>(url: string) {
  const res = await fetchWithAuth(url)
  const json = await res.json()
  return extractPayload<T>(json)
}

export async function post<T>(url: string, body?: unknown) {
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify(body ?? {}) })
  const json = await res.json()
  return extractPayload<T>(json)
}

export async function put<T>(url: string, body?: unknown) {
  const res = await fetchWithAuth(url, { method: 'PUT', body: JSON.stringify(body ?? {}) })
  const json = await res.json()
  return extractPayload<T>(json)
}

export async function patch<T>(url: string, body?: unknown) {
  const res = await fetchWithAuth(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) })
  const json = await res.json()
  return extractPayload<T>(json)
}

export async function del(url: string) {
  const res = await fetchWithAuth(url, { method: 'DELETE' })
  const json = await res.json()
  extractPayload<unknown>(json)
}

export async function logout() {
  try {
    await fetchWithAuth('/api/auth/logout', { method: 'POST', body: '{}' })
  } finally {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }
}
