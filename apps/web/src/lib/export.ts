export function downloadCSV(filename: string, rows: string[][]) {
  const escape = (cell: string) => {
    if (cell == null) return ''
    const str = String(cell)
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

interface ExportConfig {
  label: string
  filename: string
  apiPath: string
  headers: string[]
  fields: string[]
}

export const exportConfigs: ExportConfig[] = [
  {
    label: '线索',
    filename: `leads_${new Date().toISOString().slice(0, 10)}.csv`,
    apiPath: '/api/leads?pageSize=9999',
    headers: ['名称', '行业', '状态', '来源', '联系人', '电话', '职位', '邮箱', '完整度', '创建时间'],
    fields: ['name', 'industry', 'status', 'source', 'contactName', 'contactPhone', 'contactPosition', 'contactEmail', 'completenessScore', 'createdAt'],
  },
  {
    label: '商机',
    filename: `projects_${new Date().toISOString().slice(0, 10)}.csv`,
    apiPath: '/api/projects?pageSize=9999',
    headers: ['名称', '行业', '金额(万)', '里程碑', '紧急度', '健康度', '创建时间'],
    fields: ['name', 'industry', 'amount', 'milestone', 'urgency', 'healthScore', 'createdAt'],
  },
  {
    label: '客户',
    filename: `customers_${new Date().toISOString().slice(0, 10)}.csv`,
    apiPath: '/api/companies',
    headers: ['名称', '行业', '规模', '地区', '等级', '联系人', '电话', '创建时间'],
    fields: ['name', 'industry', 'scale', 'region', 'level', 'contactPerson', 'contactPhone', 'createdAt'],
  },
  {
    label: '拜访',
    filename: `visits_${new Date().toISOString().slice(0, 10)}.csv`,
    apiPath: '/api/visits?pageSize=9999',
    headers: ['关联项目', '拜访时间', '方式', '摘要', '联系人', '创建时间'],
    fields: ['project.name', 'visitTime', 'visitType', 'summary', 'contactName', 'createdAt'],
  },
  {
    label: '联系人',
    filename: `contacts_${new Date().toISOString().slice(0, 10)}.csv`,
    apiPath: '/api/contacts?pageSize=9999',
    headers: ['姓名', '职位', '部门', '公司', '电话', '邮箱', '决策角色', '创建时间'],
    fields: ['name', 'position', 'department', 'company', 'phone', 'email', 'decisionRole', 'createdAt'],
  },
  {
    label: '任务',
    filename: `tasks_${new Date().toISOString().slice(0, 10)}.csv`,
    apiPath: '/api/tasks?pageSize=9999',
    headers: ['标题', '描述', '优先级', '状态', '截止时间', '创建时间'],
    fields: ['title', 'description', 'priority', 'status', 'deadline', 'createdAt'],
  },
]

export function getFieldValue(item: Record<string, unknown>, path: string): string {
  const parts = path.split('.')
  let val: unknown = item
  for (const part of parts) {
    if (val == null || typeof val !== 'object') return ''
    val = (val as Record<string, unknown>)[part]
  }
  if (val == null) return ''
  if (typeof val === 'boolean') return val ? '是' : '否'
  if (typeof val === 'number') return String(val)
  if (val instanceof Date) return val.toLocaleString('zh-CN')
  const str = String(val)
  // ISO date string
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    return new Date(str).toLocaleString('zh-CN')
  }
  return str
}
