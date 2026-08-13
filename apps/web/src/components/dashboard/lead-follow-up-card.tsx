import { User, Phone, Calendar, HelpCircle } from 'lucide-react'
import type { Lead } from '../../hooks/use-leads.js'

interface LeadFollowUpCardProps {
  leads: {
    active: Lead[]
    longOverdue: Lead[]
  }
  isLoading?: boolean
  onItemClick?: (leadId: string) => void
}

function LeadItem({ lead, badge, onClick }: { lead: Lead; badge?: { text: string; class: string }; onClick?: () => void }) {
  const daysSince = lead.lastFollowUpAt
    ? Math.floor((Date.now() - new Date(lead.lastFollowUpAt).getTime()) / (1000 * 60 * 60 * 24))
    : Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24))

  return (
    <div
      className="flex cursor-pointer items-center justify-between px-5 py-3.5 transition-colors hover:bg-surface-elevated/50"
      onClick={onClick}
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{lead.name}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
          {lead.contactName && (
            <span className="flex items-center gap-1">
              <User size={12} />
              {lead.contactName}
            </span>
          )}
          {lead.contactPhone && (
            <span className="flex items-center gap-1">
              <Phone size={12} />
              {lead.contactPhone}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {lead.lastFollowUpAt ? `${daysSince} 天前跟进` : `${daysSince} 天未跟进`}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.class}`}>
            {badge.text}
          </span>
        )}
        {lead.grade && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {lead.grade}级
          </span>
        )}
      </div>
    </div>
  )
}

export function LeadFollowUpCard({ leads, isLoading, onItemClick }: LeadFollowUpCardProps) {
  const total = leads.active.length + leads.longOverdue.length

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="h-6 w-32 animate-pulse rounded-lg bg-surface-elevated" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-elevated" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">待跟进线索</h3>
          <span title="分类规则：长期未跟进 = 创建超过30天且30天内无跟进记录；活跃线索 = 状态 ACTIVE 且需要持续跟进">
            <HelpCircle size={14} className="cursor-help text-text-tertiary" />
          </span>
        </div>
        <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-sm font-medium text-success">{total}</span>
      </div>
      <div className="divide-y divide-border">
        {total === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-text-tertiary">
            暂无待跟进线索 🎉
          </div>
        ) : (
          <>
            {leads.longOverdue.length > 0 && (
              <div>
                <div className="flex items-center gap-2 bg-surface-elevated/30 px-5 py-2 text-xs font-medium text-text-secondary">
                  <Calendar size={14} />
                  长期未跟进
                  <span className="ml-1 text-text-tertiary">({leads.longOverdue.length})</span>
                </div>
                {leads.longOverdue.map((lead) => (
                  <LeadItem
                    key={lead.id}
                    lead={lead}
                    badge={{ text: '超30天', class: 'bg-danger/10 text-danger' }}
                    onClick={() => onItemClick?.(lead.id)}
                  />
                ))}
              </div>
            )}
            {leads.active.length > 0 && (
              <div>
                <div className="flex items-center gap-2 bg-surface-elevated/30 px-5 py-2 text-xs font-medium text-text-secondary">
                  <User size={14} />
                  活跃线索
                  <span className="ml-1 text-text-tertiary">({leads.active.length})</span>
                </div>
                {leads.active.map((lead) => (
                  <LeadItem key={lead.id} lead={lead} onClick={() => onItemClick?.(lead.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
