import { useState } from 'react'
import { PauseCircle, PlayCircle, Loader2 } from 'lucide-react'
import {
  useProject,
  useMarkWaiting,
  useClearWaiting,
  WAITING_STATUSES,
  type WaitingStatus,
} from '../../hooks/use-projects.js'

/**
 * 等待状态管理入口（V6.1 §7.2）
 *
 * 客户侧流程性等待（招标/开学/预算/拨款/审批/会议）不应算销售停滞：
 * 标记后 daily-scan 跳过停滞检测；解除后恢复计时并写时间轴事件。
 */
export default function WaitingSection({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId)
  const mark = useMarkWaiting()
  const clear = useClearWaiting()
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<WaitingStatus>('awaiting_tender')
  const [note, setNote] = useState('')

  if (!project || project.closedAt) return null

  const busy = mark.isPending || clear.isPending

  if (project.waitingStatus) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <PauseCircle size={16} className="text-warning" />
          <span className="font-medium text-warning">
            等待中：{WAITING_STATUSES[project.waitingStatus as WaitingStatus] || project.waitingStatus}
          </span>
          {project.waitingSince && (
            <span className="text-xs text-text-tertiary">
              自 {new Date(project.waitingSince).toLocaleDateString('zh-CN')} 起 · 停滞倒计时已暂停
            </span>
          )}
        </div>
        <button
          onClick={() => clear.mutate(projectId)}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
          解除等待
        </button>
      </div>
    )
  }

  if (!picking) {
    return (
      <button
        onClick={() => setPicking(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-2 text-xs text-text-tertiary hover:border-warning/40 hover:text-warning"
      >
        <PauseCircle size={13} />
        客户在走流程？标记等待状态（暂停停滞倒计时）
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      <p className="text-xs font-medium text-text-secondary">选择等待原因（期间不计停滞）</p>
      <div className="grid grid-cols-3 gap-2">
        {(Object.entries(WAITING_STATUSES) as Array<[WaitingStatus, string]>).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSelected(key)}
            className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
              selected === key
                ? 'border-warning bg-warning/10 text-warning'
                : 'border-border text-text-secondary hover:bg-surface-elevated'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="备注（可选），如：预计 9 月开学后恢复"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-warning focus:outline-none"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setPicking(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated"
        >
          取消
        </button>
        <button
          onClick={() =>
            mark.mutate(
              { id: projectId, waitingStatus: selected, note: note.trim() || undefined },
              { onSuccess: () => { setPicking(false); setNote('') } },
            )
          }
          disabled={busy}
          className="flex items-center gap-1 rounded-lg bg-warning px-3 py-1.5 text-xs font-medium text-white hover:bg-warning/90 disabled:opacity-50"
        >
          {busy && <Loader2 size={12} className="animate-spin" />}
          确认标记
        </button>
      </div>
    </div>
  )
}
