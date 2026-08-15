import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { dismissToast, useToasts } from '../../lib/toast.js'

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
}

const styleMap = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-primary/30 bg-primary/10 text-primary',
}

export default function Toaster() {
  const toasts = useToasts()
  if (toasts.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = iconMap[t.type]
        return (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`flex w-72 items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm transition-all animate-slide-in-right ${styleMap[t.type]}`}
          >
            <Icon size={18} className="shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="关闭提示"
              className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
