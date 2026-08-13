export type EntityLinkType = 'project' | 'lead' | 'customer' | 'visit' | 'task' | 'contact'

export const ENTITY_NAVIGATE_EVENT = 'entity-navigate'

const ROUTE_MAP: Record<EntityLinkType, string> = {
  project: '/projects',
  lead: '/leads',
  customer: '/customers',
  visit: '/visits',
  task: '/tasks',
  contact: '/contacts',
}

const VALID_TYPES = new Set<string>(Object.keys(ROUTE_MAP))

export interface EntityRef {
  type: EntityLinkType
  id: string
}

/**
 * 解析 entity://<type>/<id> 形式的内部实体链接。
 * 非实体链接返回 null。
 */
export function parseEntityUrl(url: string): EntityRef | null {
  if (!url.startsWith('entity://')) return null
  const rest = url.slice('entity://'.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const type = rest.slice(0, slash)
  const id = rest.slice(slash + 1)
  if (!VALID_TYPES.has(type) || !id) return null
  return { type: type as EntityLinkType, id }
}

/**
 * 根据实体类型/ID 生成路由目标（列表路由 + ?id= 打开详情）。
 */
export function entityRouteTo(type: EntityLinkType, id: string): { pathname: string; search: string } {
  return { pathname: ROUTE_MAP[type], search: `?id=${encodeURIComponent(id)}` }
}

/**
 * 触发实体导航事件，由 Layout 中的监听器调用 react-router 跳转。
 */
export function dispatchEntityNavigate(ref: EntityRef): void {
  window.dispatchEvent(new CustomEvent(ENTITY_NAVIGATE_EVENT, { detail: ref }))
}
