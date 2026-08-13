import { Sparkles } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCopilotStore } from '../../stores/copilot-store.js'

export type AiEntityType = 'project' | 'visit' | 'lead' | 'customer' | 'task' | 'contact'

export interface AiEntryButtonProps {
  /** 发送给小销的提示词 */
  prompt: string
  /** 按钮文字，默认 '问小销' */
  label?: string
  /** 是否只显示图标（无文字） */
  iconOnly?: boolean
  /** 当前实体类型 */
  entityType?: AiEntityType
  /** 当前实体 ID */
  entityId?: string
  /** 样式变体 */
  variant?: 'primary' | 'ghost' | 'inline'
  className?: string
  /** 是否禁用 */
  disabled?: boolean
}

/**
 * 统一 AI 入口按钮
 *
 * 行为：
 * 1. 如果传了 entityType/entityId，先把上下文写入 URL query（replace，不产生新历史记录）。
 * 2. dispatch ai-copilot-prompt 事件，让小销助手 append 这条消息。
 */
export default function AiEntryButton({
  prompt,
  label = '问小销',
  iconOnly = false,
  entityType,
  entityId,
  variant = 'ghost',
  className = '',
  disabled = false,
}: AiEntryButtonProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const showCopilot = useCopilotStore((state) => state.show)

  const handleClick = () => {
    showCopilot()

    const searchParams = new URLSearchParams(location.search)

    if (entityType) {
      searchParams.set('entityType', entityType)
    } else {
      searchParams.delete('entityType')
    }

    if (entityId) {
      searchParams.set('entityId', entityId)
    } else {
      searchParams.delete('entityId')
    }

    const newSearch = searchParams.toString()
    navigate(
      {
        pathname: location.pathname,
        search: newSearch ? `?${newSearch}` : '',
      },
      { replace: true },
    )

    // 延迟一帧触发事件，确保 useCopilot 的 pageContext 已更新
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('ai-copilot-prompt', { detail: prompt }))
    }, 0)
  }

  const baseStyles =
    'inline-flex items-center justify-center gap-1 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const variantStyles = {
    primary:
      'bg-primary/10 text-primary hover:bg-primary/15 px-2.5 py-1.5 text-xs',
    ghost:
      'text-text-tertiary hover:text-primary hover:bg-primary/5 px-1.5 py-1 text-xs',
    inline:
      'text-primary hover:underline px-0 py-0 text-xs',
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      title={prompt}
    >
      <Sparkles size={iconOnly ? 14 : 12} />
      {!iconOnly && <span>{label}</span>}
    </button>
  )
}
