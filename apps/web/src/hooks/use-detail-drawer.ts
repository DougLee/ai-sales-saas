import { useEffect, useSyncExternalStore } from 'react'

/**
 * #20 轮询互斥：详情 Drawer 打开时暂停列表 30s 轮询。
 *
 * 背景：leads/customers/projects 页开 drawer 时，同一页面同时跑
 * 列表(30s) + 详情关联(follow-ups/timeline 30s) + assessment-job(3s)
 * 共 7-8 个并发轮询，列表轮询在 drawer 遮挡下是纯浪费。
 *
 * 实现说明：原计划用 URL 参数（entityType/entityId）判断 drawer 是否打开，
 * 但实测只有 projects 页在 drawer 打开期间把 entityType/entityId 写进 URL，
 * leads/customers 的 ?id= 深链在打开后立即被清除（setSearchParams({})）。
 * routes 文件禁止改动，因此改用「详情查询 hook 登记」方案：
 * useLead/useCompany/useProject 在 id 激活时登记一个全局计数，
 * 列表 hook（useLeads/useCompanies/useProjects）读取该计数决定是否轮询。
 * 零 routes 改动，且对详情弹窗/表单 modal 同样生效。
 */

let openCount = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return openCount > 0
}

/** 详情查询 hook 内部调用：active 为 true 期间登记「详情已打开」 */
export function useDetailDrawerActive(active: boolean) {
  useEffect(() => {
    if (!active) return
    openCount += 1
    emit()
    return () => {
      openCount -= 1
      emit()
    }
  }, [active])
}

/** 列表 hook 内部调用：任一详情 drawer 打开时返回 true（暂停轮询） */
export function useListPollingPaused(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
