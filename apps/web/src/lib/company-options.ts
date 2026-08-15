/**
 * 客户档案下拉选项（ADR-0001 / 设计稿 20260813）
 * 表单与列表筛选用同一份真源，避免两处漂移。
 * 历史自由文本值不在列表内：显示时原样 fallback，不丢数据。
 */

export const INDUSTRY_OPTIONS = [
  { value: '教育·高等院校', label: '教育 · 高等院校' },
  { value: '教育·职业院校', label: '教育 · 职业院校' },
  { value: '教育·K12', label: '教育 · K12' },
  { value: '医疗', label: '医疗' },
  { value: '政企', label: '政企' },
  { value: '其他', label: '其他' },
] as const

export const SCALE_OPTIONS = [
  { value: '100人以下', label: '100 人以下' },
  { value: '100-500人', label: '100-500 人' },
  { value: '500-2000人', label: '500-2000 人' },
  { value: '2000人以上', label: '2000 人以上' },
  { value: '省属高校', label: '省属高校' },
  { value: '部属高校', label: '部属高校' },
] as const

export const SOURCE_OPTIONS = [
  { value: 'ai_recommendation', label: '小销助手收集' },
  { value: 'phone_dev', label: '电话开发' },
  { value: 'referral', label: '转介绍' },
  { value: 'exhibition', label: '展会活动' },
  { value: 'website', label: '官网咨询' },
  { value: 'partner', label: '合作伙伴' },
  { value: 'other', label: '其他' },
] as const

export const LEVEL_OPTIONS = [
  { value: 'A', label: 'A - 战略客户', dot: 'bg-warning' },
  { value: 'B', label: 'B - 重点客户', dot: 'bg-primary' },
  { value: 'C', label: 'C - 普通客户', dot: 'bg-text-tertiary/40' },
  { value: 'D', label: 'D - 潜在客户', dot: 'bg-text-tertiary/40' },
] as const

/** 来源值 → 显示名（历史自由文本原样 fallback） */
export function sourceLabel(source?: string | null): string {
  if (!source) return '-'
  return SOURCE_OPTIONS.find((s) => s.value === source)?.label || source
}

/** 行业值 → 显示名（兼容旧 key 如 education） */
export function industryLabel(industry?: string | null, legacyMap?: Record<string, string>): string {
  if (!industry) return '-'
  const canonical = INDUSTRY_OPTIONS.find((i) => i.value === industry)?.label
  if (canonical) return canonical
  return legacyMap?.[industry] || industry
}
