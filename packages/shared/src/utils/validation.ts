/**
 * 前后端共享的表单字段校验工具。
 *
 * 设计原则：
 * - 只做格式校验，不做归属/唯一性校验（后者需查库，由各业务服务负责）。
 * - 校验函数对空值（'' / null / undefined）一律返回 true，
 *   是否必填由调用方通过 zod `.min(1)` 或 React 的 required 控制，
 *   避免「可选字段填了非法值不报错、没填反而报错」的语义混乱。
 */

/** 中国大陆手机号：1 开头，第二位 3-9，共 11 位 */
const MOBILE_RE = /^1[3-9]\d{9}$/

/**
 * 中国大陆固定电话（座机）：
 * 区号 3-4 位（可带 0 前缀），号码 7-8 位，分隔符可选，分机号可选。
 * 例：010-12345678 / 0571-1234567 / 02112345678 / 010-12345678-123
 */
const LANDLINE_RE = /^0\d{2,3}-?\d{7,8}(-\d{1,6})?$/

/** 去除手机号/电话中的空格、连字符等常见分隔符 */
export function normalizePhone(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/[\s()（）]/g, '').trim()
}

/** 是否为合法的中国大陆手机号（空值视为合法） */
export function isValidMobile(value: string | null | undefined): boolean {
  if (!value) return true
  return MOBILE_RE.test(normalizePhone(value))
}

/** 是否为合法的座机号（空值视为合法） */
export function isValidLandline(value: string | null | undefined): boolean {
  if (!value) return true
  const normalized = normalizePhone(value)
  return LANDLINE_RE.test(normalized)
}

/** 是否为合法的电话号码（手机号或座机，空值视为合法） */
export function isValidPhone(value: string | null | undefined): boolean {
  if (!value) return true
  return isValidMobile(value) || isValidLandline(value)
}

/** 校验失败时的统一提示文案 */
export const PHONE_ERROR_MESSAGE = '请输入正确的手机号或座机号'
export const MOBILE_ERROR_MESSAGE = '请输入正确的 11 位手机号'

/** 邮箱格式校验（空值视为合法） */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return true
  return EMAIL_RE.test(value.trim())
}
export const EMAIL_ERROR_MESSAGE = '请输入正确的邮箱地址'
