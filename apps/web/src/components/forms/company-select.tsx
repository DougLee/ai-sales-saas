import { Building2 } from 'lucide-react'
import { useCompanies, type Company } from '../../hooks/use-companies.js'

interface CompanySelectProps {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  required?: boolean
  label?: string
  placeholder?: string
}

export default function CompanySelect({
  value,
  onChange,
  disabled,
  required,
  label = '所属客户',
  placeholder = '请选择客户',
}: CompanySelectProps) {
  const { data, isLoading } = useCompanies({})
  const companies = data?.items || []
  const selected = companies.find((c) => c.id === value)

  if (disabled && value) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">{label}{required ? ' *' : ''}</label>
        <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm text-text-primary">
          <Building2 size={14} className="text-text-tertiary" />
          {selected?.name || '已选客户'}
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text-secondary">{label}{required ? ' *' : ''}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={isLoading || disabled}
        className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none focus:border-primary disabled:opacity-60"
      >
        <option value="">{placeholder}</option>
        {companies.map((company: Company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      {isLoading && <p className="mt-1 text-xs text-text-tertiary">加载客户列表中...</p>}
    </div>
  )
}
