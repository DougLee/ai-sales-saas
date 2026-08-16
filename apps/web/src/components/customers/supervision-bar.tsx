import { Loader2, ShieldCheck, UserRoundX, UsersRound } from 'lucide-react'
import { KpiTile } from '../ui/kpi-tile.js'

/**
 * 角色覆盖督导条（issue #43 统计条增强）：
 * - 「无联系人客户」：列表 _count.contacts === 0，前端聚合（当前页口径），点击即筛选
 * - 「缺决策者客户」：需逐客户取 contacts 才能判定——不做常驻批量 detail 拉取，
 *   由「督导检查」按钮按需批量核对后再展示；点击即筛选
 */

interface SupervisionBarProps {
  /** 当前页客户总数（前端聚合口径） */
  totalCount: number
  /** 已取到联系人档案的客户数（条带展开 / 督导检查后） */
  knownCount: number
  noContactCount: number
  noContactActive: boolean
  onToggleNoContact: () => void
  /** null = 尚未完成过督导检查（值未知，点击先触发检查） */
  missingDecisionMakerCount: number | null
  missingDecisionMakerActive: boolean
  onToggleMissingDecisionMaker: () => void
  checking: boolean
  onCheck: () => void
}

export default function SupervisionBar({
  totalCount,
  knownCount,
  noContactCount,
  noContactActive,
  onToggleNoContact,
  missingDecisionMakerCount,
  missingDecisionMakerActive,
  onToggleMissingDecisionMaker,
  checking,
  onCheck,
}: SupervisionBarProps) {
  const checked = missingDecisionMakerCount !== null
  const allKnown = totalCount > 0 && knownCount >= totalCount

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <KpiTile
        label={noContactActive ? '无联系人客户 · 筛选中，点击取消' : '无联系人客户 · 点击筛选'}
        value={noContactCount}
        tone="warning"
        icon={UserRoundX}
        onClick={onToggleNoContact}
        className={noContactActive ? 'border-warning/50 bg-warning/[0.03]' : ''}
      />
      <KpiTile
        label={
          checked
            ? `缺决策者客户 · 已核对 ${knownCount}/${totalCount}${missingDecisionMakerActive ? ' · 筛选中，点击取消' : ' · 点击筛选'}`
            : '缺决策者客户 · 点击开始督导检查'
        }
        value={checked ? missingDecisionMakerCount : '—'}
        tone="danger"
        icon={UsersRound}
        // 未核对时点击 = 触发督导检查；已核对 = 切换筛选
        onClick={checked ? onToggleMissingDecisionMaker : onCheck}
        className={missingDecisionMakerActive ? 'border-danger/50 bg-danger/[0.03]' : ''}
      />
      <button
        type="button"
        onClick={onCheck}
        disabled={checking || allKnown}
        className="flex items-center justify-center gap-2 rounded-card border border-border bg-surface px-4 py-3.5 text-sm font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-default disabled:opacity-60"
        title="批量调取本页客户详情，核对决策链角色覆盖（决策者/影响力者缺角）"
      >
        {checking ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
        {checking ? '核对中…' : allKnown ? '本页已全量核对' : '督导检查'}
        <span className="hidden text-xs font-normal text-text-tertiary sm:inline">批量核对角色覆盖</span>
      </button>
    </div>
  )
}
