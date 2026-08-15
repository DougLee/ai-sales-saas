import { useSearchParams } from 'react-router-dom'
import { Trophy, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { useTeamRanking, getWeekStart, toWeekStartParam } from '../hooks/use-team-ranking.js'
import { LoadingState, ErrorState, EmptyState } from '../components/ui/states.js'

/**
 * 团队排名页（V6.1 §6.2）
 *
 * WQMI = 平均质量分 × 0.6 + 闭环率 × 40
 * 设计意图：轻量排名（不是排行榜内卷），分数构成透明——行为分与 AI 质量分分列，
 * 让销售知道分从哪来、往哪补。
 */
export default function TeamRanking() {
  // P2：周偏移进 URL（?week=0/1/2...），刷新/分享不丢
  const [searchParams, setSearchParams] = useSearchParams()
  const parsed = parseInt(searchParams.get('week') || '0', 10)
  const weekOffset = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  const setWeekOffset = (updater: (w: number) => number) => {
    const next = updater(weekOffset)
    const params = new URLSearchParams(searchParams)
    if (next > 0) params.set('week', String(next))
    else params.delete('week')
    setSearchParams(params, { replace: true })
  }
  const weekStartDate = new Date(getWeekStart().getTime() - weekOffset * 7 * 86400000)
  const weekParam = toWeekStartParam(weekStartDate)
  const { data, isLoading, error, refetch } = useTeamRanking(weekParam)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">团队排名</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            WQMI = 平均质量分 × 0.6 + 闭环率 × 40；质量分 = 行为分（0-60) + AI 信息增量（0-40)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-tertiary hover:bg-surface-elevated"
            title="上一周"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[120px] text-center text-sm text-text-secondary">
            {weekOffset === 0 ? '本周' : weekOffset === 1 ? '上周' : `${weekParam} 周`}
          </span>
          <button
            onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
            disabled={weekOffset === 0}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-tertiary hover:bg-surface-elevated disabled:opacity-40"
            title="下一周"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {isLoading && <LoadingState />}
      {error && <ErrorState message={(error as Error).message} onRetry={() => refetch()} />}

      {!isLoading && !error && data && data.rankings.length === 0 && (
        <EmptyState icon={Trophy} title="暂无团队成员数据" description="团队成员完成拜访闭环后自动生成排名" />
      )}

      {!isLoading && !error && data && data.rankings.length > 0 && (
        <>
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-3">
            <Trophy size={18} className="text-warning" />
            <span className="text-sm text-text-secondary">
              团队平均 WQMI：<span className="text-lg font-bold text-text-primary">{data.teamAvg}</span>
            </span>
            <span className="text-xs text-text-tertiary">{data.rankings.length} 名成员 · {data.weekStart} 起</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/50 text-xs text-text-tertiary">
                  <th className="px-4 py-3 text-left font-medium">#</th>
                  <th className="px-4 py-3 text-left font-medium">成员</th>
                  <th className="px-4 py-3 text-right font-medium">WQMI</th>
                  <th className="px-4 py-3 text-right font-medium">周环比</th>
                  <th className="px-4 py-3 text-right font-medium">拜访数</th>
                  <th className="px-4 py-3 text-right font-medium">平均质量分</th>
                  <th className="px-4 py-3 text-right font-medium">行为分</th>
                  <th className="px-4 py-3 text-right font-medium">AI 质量分</th>
                  <th className="px-4 py-3 text-right font-medium">闭环率</th>
                  <th className="px-4 py-3 text-right font-medium">在跟/停滞</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rankings.map((r, idx) => (
                  <tr key={r.userId} className="hover:bg-surface-elevated/40">
                    <td className="px-4 py-3">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        idx === 0 ? 'bg-warning/15 text-warning' :
                        idx === 1 ? 'bg-text-tertiary/15 text-text-secondary' :
                        idx === 2 ? 'bg-orange-500/10 text-orange-500' :
                        'text-text-tertiary'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary">{r.name}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-base font-bold text-text-primary">{r.wqmi}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.trend == null ? (
                        <span className="text-xs text-text-tertiary">—</span>
                      ) : r.trend > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success">
                          <TrendingUp size={12} /> +{r.trend}
                        </span>
                      ) : r.trend < 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-danger">
                          <TrendingDown size={12} /> {r.trend}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-xs text-text-tertiary">
                          <Minus size={12} /> 0
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">{r.visitCount}</td>
                    <td className="px-4 py-3 text-right text-text-secondary">{r.avgScore}</td>
                    <td className="px-4 py-3 text-right text-text-secondary">{r.avgBehaviorScore}<span className="text-text-tertiary">/60</span></td>
                    <td className="px-4 py-3 text-right text-secondary">{r.avgRubricWeighted}<span className="text-text-tertiary">/40</span></td>
                    <td className="px-4 py-3 text-right text-text-secondary">{r.closureRate}%</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-text-secondary">{r.activeProjects}</span>
                      {r.staleProjects > 0 && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-danger" title="停滞项目">
                          <AlertTriangle size={11} />{r.staleProjects}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </>
      )}
    </div>
  )
}
