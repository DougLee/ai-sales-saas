import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BattleUnit } from './battle.utils.js'
import { cn } from '../../lib/utils.js'

/**
 * 今日作战 · 其余战线（issue #34 区域②折叠层）
 * 无紧迫动作的客户默认收起，展开是一行一客户的轻量列表，全量任务引导去任务页。
 */

export function OtherFronts({ units }: { units: BattleUnit[] }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()

  if (units.length === 0) return null

  const totalTasks = units.reduce((sum, u) => sum + u.tasks.length, 0)
  const totalOverdue = units.reduce((sum, u) => sum + u.overdueCount, 0)

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-5 py-3.5 text-left transition-colors hover:bg-surface-elevated/50"
      >
        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="text-sm font-medium text-text-secondary">其余战线</span>
        <span className="text-xs text-text-tertiary">
          {units.length} 个客户 · {totalTasks} 项任务{totalOverdue > 0 ? ` · 逾期 ${totalOverdue}` : ''}
        </span>
        <span className="ml-auto text-xs text-text-tertiary">{expanded ? '收起' : '展开'}</span>
      </button>

      {expanded && (
        <div className="divide-y divide-border border-t border-border">
          {units.map((unit) => (
            <button
              key={unit.key}
              type="button"
              onClick={() => (unit.companyId ? navigate(`/customers?id=${unit.companyId}`) : navigate('/tasks'))}
              className="flex w-full items-center justify-between gap-2 px-5 py-2 text-left transition-colors hover:bg-surface-elevated/50"
            >
              <span className="min-w-0 truncate text-sm text-text-secondary">{unit.companyName}</span>
              <span className="shrink-0 text-xs text-text-tertiary">
                <span className={cn(unit.overdueCount > 0 && 'font-medium text-danger')}>
                  {unit.overdueCount > 0 ? `逾期 ${unit.overdueCount} · ` : ''}
                  {unit.tasks.length} 项任务
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="w-full px-5 py-2.5 text-left text-xs text-primary hover:bg-surface-elevated/50"
          >
            全量任务去任务页处理 →
          </button>
        </div>
      )}
    </div>
  )
}
