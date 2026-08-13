import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

/**
 * 表单控件三件套（P2 表单基建）：FormInput / FormSelect / FormTextarea
 * - 统一控件样式串（原先在各表单复制了 40+ 处）
 * - 统一必填红星：<span class="text-danger">*</span>，不再手写 " *"
 * - label 通过 useId 自动关联控件（可访问性）
 * - size="sm" 用于卡片内嵌的紧凑字段（h-9 rounded-lg）
 */

type Size = 'md' | 'sm'

const SIZE_CLS: Record<Size, string> = {
  md: 'h-10 rounded-xl px-4',
  sm: 'h-9 rounded-lg px-3',
}

const BASE_CLS =
  'w-full border border-border bg-background text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary disabled:opacity-60'

function FieldLabel({ id, label, required }: { id: string; label: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={id} className="mb-1 block text-sm font-medium text-text-secondary">
      {label}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </label>
  )
}

interface CommonProps {
  label: ReactNode
  required?: boolean
  hint?: string
  size?: Size
  /** 外层容器 className */
  wrapperClassName?: string
}

export function FormInput({
  label,
  required,
  hint,
  size = 'md',
  wrapperClassName,
  className,
  ...props
}: CommonProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>) {
  const id = useId()
  return (
    <div className={wrapperClassName}>
      <FieldLabel id={id} label={label} required={required} />
      <input id={id} required={required} className={`${BASE_CLS} ${SIZE_CLS[size]} ${className || ''}`} {...props} />
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </div>
  )
}

export function FormSelect({
  label,
  required,
  hint,
  size = 'md',
  wrapperClassName,
  className,
  children,
  ...props
}: CommonProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>) {
  const id = useId()
  return (
    <div className={wrapperClassName}>
      <FieldLabel id={id} label={label} required={required} />
      <select id={id} required={required} className={`${BASE_CLS} ${SIZE_CLS[size]} ${className || ''}`} {...props}>
        {children}
      </select>
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </div>
  )
}

export function FormTextarea({
  label,
  required,
  hint,
  wrapperClassName,
  className,
  ...props
}: CommonProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <div className={wrapperClassName}>
      <FieldLabel id={id} label={label} required={required} />
      <textarea id={id} required={required} className={`${BASE_CLS} rounded-xl px-4 py-2 ${className || ''}`} {...props} />
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </div>
  )
}
