interface DateFieldProps {
  value: string
  onChange: (value: string) => void
  label?: string
  /** date = YYYY-MM-DD；datetime-local = YYYY-MM-DDTHH:mm */
  mode?: 'date' | 'datetime'
  /** 是否禁止选择今天之前的日期（默认 false） */
  disablePast?: boolean
  required?: boolean
  disabled?: boolean
  className?: string
}

/** 返回本地时区的 YYYY-MM-DD（date 模式）或 YYYY-MM-DDTHH:mm（datetime 模式） */
function nowBound(mode: 'date' | 'datetime'): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (mode === 'date') return date
  return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 统一日期/时间选择组件。
 * - 统一输出格式：date 模式 YYYY-MM-DD，datetime 模式 YYYY-MM-DDTHH:mm。
 * - disablePast 时通过原生 min 属性禁用过去日期（业务如「下次跟进时间」）。
 */
export default function DateField({
  value,
  onChange,
  label,
  mode = 'date',
  disablePast = false,
  required = false,
  disabled = false,
  className = '',
}: DateFieldProps) {
  const min = disablePast ? nowBound(mode) : undefined

  return (
    <div className={className}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <input
        type={mode === 'datetime' ? 'datetime-local' : 'date'}
        value={value}
        min={min}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none transition-colors focus:border-primary disabled:opacity-50"
      />
    </div>
  )
}
