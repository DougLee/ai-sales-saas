import type { Visit } from '../../hooks/use-visits.js'

/** 拜访准备区的纯逻辑（从组件文件抽出，满足 react-refresh 单导出约束） */

/** 未来 N 天内且未关闭的拜访，按时间升序（默认 7 天窗口） */
export function upcomingVisits(visits: Visit[], days = 7): Visit[] {
  const now = Date.now()
  const horizon = now + days * 86400000
  return visits
    .filter((v) => {
      const t = new Date(v.visitTime).getTime()
      return t >= now - 3600_000 && t <= horizon && v.workflowStage !== 'CLOSED'
    })
    .sort((a, b) => a.visitTime.localeCompare(b.visitTime))
}
