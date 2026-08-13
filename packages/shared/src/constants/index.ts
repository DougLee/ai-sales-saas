export * from './methodology.js'
import type { UserRole } from '../types/crm.types.js'

export const USER_ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: 'SUPER_ADMIN', label: '超级管理员', description: '平台级管理员，可跨租户管理' },
  { value: 'TENANT_ADMIN', label: '租户管理员', description: '租户内最高权限，可管理成员和配置' },
  { value: 'DEPT_HEAD', label: '部门主管', description: '管理部门数据，可分配客户' },
  { value: 'SALES', label: '销售', description: '负责跟进自己的线索、客户、商机' },
  { value: 'VIEWER', label: '只读用户', description: '仅查看数据，无法编辑' },
]
