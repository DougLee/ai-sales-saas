import { useState } from 'react'
import { isValidPhone, normalizePhone, PHONE_ERROR_MESSAGE } from '@ai-sales/shared'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  /** 失焦时回调，返回当前是否合法，便于父表单做提交前校验 */
  onValidChange?: (valid: boolean) => void
  label?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

/**
 * 手机号/电话输入框，带实时格式校验。
 * 失焦后才显示错误，避免输入过程中频繁红框打扰。
 */
export default function PhoneInput({
  value,
  onChange,
  onValidChange,
  label,
  placeholder = '手机号或座机',
  required = false,
  disabled = false,
  className = '',
}: PhoneInputProps) {
  const [touched, setTouched] = useState(false)

  const isEmpty = !value.trim()
  const formatValid = isValidPhone(value)
  const requiredInvalid = required && isEmpty
  const showError = touched && (requiredInvalid || !formatValid)
  const errorText = requiredInvalid ? '此项为必填' : PHONE_ERROR_MESSAGE

  return (
    <div className={className}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <input
        type="tel"
        inputMode="tel"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setTouched(true)
          // 失焦时归一化（去除空格/括号），避免脏数据入库
          const normalized = normalizePhone(value)
          if (normalized !== value) onChange(normalized)
          onValidChange?.(!isEmpty && isValidPhone(value))
        }}
        placeholder={placeholder}
        className={`h-10 w-full rounded-xl border bg-background px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary transition-colors focus:border-primary disabled:opacity-50 ${
          showError ? 'border-danger' : 'border-border'
        }`}
      />
      {showError && <p className="mt-1 text-xs text-danger">{errorText}</p>}
    </div>
  )
}
