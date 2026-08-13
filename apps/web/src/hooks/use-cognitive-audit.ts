import { useState, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''

interface AuditInput {
  transcript: string
  projectId?: string
  customerId?: string
  customerType?: string
  audioUrl?: string
}

export function useCognitiveAudit() {
  const [result, setResult] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const audit = useCallback(async (input: AuditInput, onChunk?: (chunk: string) => void) => {
    setIsLoading(true)
    setError(null)
    setResult('')

    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`${API_BASE}/api/agent/audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `审计失败: ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''

      let done = false
      while (!done) {
        const chunk = await reader.read()
        done = chunk.done
        if (done) break
        const text = decoder.decode(chunk.value, { stream: true })
        full += text
        setResult(full)
        onChunk?.(full)
      }

      return full
    } catch (err) {
      const msg = (err as Error).message || '认知审计失败'
      setError(msg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult('')
    setError(null)
    setIsLoading(false)
  }, [])

  return { audit, isLoading, result, error, reset }
}
