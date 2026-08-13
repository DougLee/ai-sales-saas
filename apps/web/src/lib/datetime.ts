/** ISO 时间串 → datetime-local 控件所需的本地时间格式（YYYY-MM-DDTHH:mm）。
 *  直接对 ISO 串 slice(0,16) 得到的是 UTC 时间，会差一个时区。 */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local/date 控件的本地值 → ISO 串（空值返回 undefined） */
export function localInputToISO(value: string): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}
