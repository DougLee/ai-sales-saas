import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react'

/**
 * 详情页三区制帮手组件（issue #38）：
 * - DetailLayout：头区（名称+徽章+meta+主行动+次行动+⋯菜单）/ 体区（分区+栅格）/ 尾区（粘底行动条）
 * - DetailActionMenu：⋯ 菜单（危险操作收纳）
 * - DetailSection / DetailFieldGrid / DetailField：统一小节样式 + 两列短字段栅格
 * - DetailKpiRow：紧凑 KPI 串（4 卡一行）
 * - DetailCollapsible：折叠区——空模块折叠为一行占位条，不再固定大块
 */

/** ⋯ 菜单项定义（危险操作一律收进菜单） */
export interface DetailMenuItem {
  key: string
  label: string
  icon?: ReactNode
  danger?: boolean
  onSelect: () => void
}

export function DetailActionMenu({ items }: { items: DetailMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (items.length === 0) return null
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[190px] rounded-xl border border-border bg-surface py-1.5 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.key}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors ${
                item.danger
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface DetailLayoutProps {
  /** 名称（头区主标题） */
  title: ReactNode
  /** 状态 / 层级徽章串 */
  badges?: ReactNode
  /** meta 行：行业 / 规模 / 地区 / 归属等 */
  meta?: ReactNode
  /** 主行动（一屏唯一 primary，36px 高） */
  primary?: ReactNode
  /** 次行动（描边样式，位于主行动左侧） */
  secondary?: ReactNode
  /** ⋯ 菜单项（合并 / 释放 / 状态切换等危险操作收进来） */
  menu?: DetailMenuItem[]
  /** 尾区：粘底行动条内容（主行动 + 次行动，随滚动可达） */
  footer?: ReactNode
  /** 体区内容 */
  children: ReactNode
}

/**
 * 三区制布局：头区常驻（名称 + 徽章 + 主行动），体区 flex-1 分区滚动，
 * 尾区 sticky bottom 行动条。放在 Drawer 的滚动容器内使用。
 */
export function DetailLayout({ title, badges, meta, primary, secondary, menu, footer, children }: DetailLayoutProps) {
  const hasActions = !!(primary || secondary || (menu && menu.length > 0))
  return (
    <div className="flex min-h-full flex-col">
      {/* 头区：名称 + 徽章 + meta + 主行动（primary）+ 次行动 + ⋯ 菜单 */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold leading-snug text-text-primary">{title}</h3>
            {badges}
          </div>
          {meta && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">{meta}</div>
          )}
        </div>
        {hasActions && (
          <div className="flex shrink-0 items-center gap-2">
            {secondary}
            {primary}
            <DetailActionMenu items={menu || []} />
          </div>
        )}
      </header>

      {/* 体区：分区 + 栅格 */}
      <main className="mt-5 flex-1 space-y-4">{children}</main>

      {/* 尾区：粘底行动条，随滚动可达 */}
      {footer && (
        <footer className="sticky bottom-0 -mx-5 mt-5 border-t border-border bg-surface/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-end gap-2">{footer}</div>
        </footer>
      )}
    </div>
  )
}

/** 统一小节标题样式的内容卡 */
export function DetailSection({
  title,
  icon,
  action,
  children,
}: {
  title: ReactNode
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <h4 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-text-secondary">
        {icon}
        {title}
        {action && <span className="ml-auto font-normal">{action}</span>}
      </h4>
      {children}
    </section>
  )
}

export interface DetailKpi {
  label: ReactNode
  value: ReactNode
  tone?: 'success' | 'warning' | 'danger'
}

/** 紧凑 KPI 串（4 卡一行） */
export function DetailKpiRow({ items }: { items: DetailKpi[] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((k, i) => (
        <div key={i} className="rounded-lg border border-border bg-background px-2.5 py-2">
          <p
            className={`truncate text-base font-bold leading-tight ${
              k.tone === 'success' ? 'text-success' : k.tone === 'warning' ? 'text-warning' : k.tone === 'danger' ? 'text-danger' : 'text-text-primary'
            }`}
          >
            {k.value}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{k.label}</p>
        </div>
      ))}
    </div>
  )
}

/** 短字段两列栅格；长字段传 span 独占整行 */
export function DetailFieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
}

export function DetailField({ label, value, span }: { label: string; value?: ReactNode; span?: boolean }) {
  const empty =
    value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  return (
    <div className={span ? 'col-span-2' : undefined}>
      <p className="text-[11px] text-text-tertiary">{label}</p>
      {empty ? (
        <p className="mt-0.5 text-sm text-text-tertiary/60">— 待补充</p>
      ) : (
        <div className="mt-0.5 break-words text-sm text-text-primary">{value}</div>
      )}
    </div>
  )
}

/**
 * 折叠区（issue #38：空模块一律折叠为占位条）：
 * - 空模块 → 一行占位条「标题 · 暂无记录 ▸」，点击可展开
 * - 非空模块 → 常规小节卡（标题 + 计数 + ▾），默认展开可收起
 */
export function DetailCollapsible({
  title,
  icon,
  count,
  isEmpty = false,
  emptyText = '暂无记录',
  emptyHint,
  defaultOpen,
  action,
  children,
}: {
  title: ReactNode
  icon?: ReactNode
  count?: number
  isEmpty?: boolean
  emptyText?: string
  /** 空模块展开后展示的引导文案 */
  emptyHint?: string
  defaultOpen?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState<boolean>(isEmpty ? false : (defaultOpen ?? true))
  // 数据异步到达（isEmpty 翻转）时自动展开/收起，避免「有数据却收起」；不影响挂载时的 defaultOpen
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    setOpen(!isEmpty)
  }, [isEmpty])
  const toggle = () => setOpen((v) => !v)

  // 空模块：一行占位条，不再固定大块
  if (isEmpty) {
    return (
      <div>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={toggle}
          onKeyDown={(e) => e.key === 'Enter' && toggle()}
          className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-left transition-colors hover:border-primary/30"
        >
          {icon}
          <span className="text-[13px] font-medium text-text-secondary">{title}</span>
          <span className="text-xs text-text-tertiary">{emptyText}</span>
          <span className="ml-auto text-text-tertiary">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </div>
        {open && (
          <div className="mt-2 rounded-xl border border-border bg-background px-4 py-3 text-xs text-text-tertiary">
            {emptyHint || emptyText}
            {children}
          </div>
        )}
      </div>
    )
  }

  // 非空模块：常规可折叠小节
  return (
    <div className="rounded-xl border border-border bg-background">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => e.key === 'Enter' && toggle()}
        className="flex w-full cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-left"
      >
        {icon}
        <span className="text-[13px] font-semibold text-text-secondary">{title}</span>
        {count !== undefined && (
          <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary">
            {count}
          </span>
        )}
        {action && (
          <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
            {action}
          </span>
        )}
        <span className={`${action ? '' : 'ml-auto'} text-text-tertiary`}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </div>
      {open && <div className="border-t border-border/60 px-4 py-3">{children}</div>}
    </div>
  )
}
