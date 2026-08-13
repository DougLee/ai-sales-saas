import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, Info, TrendingUp, Users, Target, Activity, Calendar, CheckSquare, MessageSquare } from 'lucide-react'

const LABEL_MAP: Record<string, string> = {
  // background_research
  customerProfile: '客户画像',
  basicInfo: '基本信息',
  aiEducationStatus: 'AI 教育现状',
  researchStrength: '科研实力',
  productMatch: '产品匹配',
  sources: '数据来源',
  decisionChain: '决策链',
  timeWindow: '时间窗口',
  painPoints: '痛点信号',
  policyLevers: '政策杠杆',
  risksAndOpportunities: '风险与机会',
  visitStrategy: '拜访策略',
  sku1Chain: '通识课决策链',
  sku2Chain: '专业群决策链',
  sku3Chain: '实训室决策链',
  // basicInfo
  level: '办学层次',
  studentScale: '学生规模',
  location: '所在地',
  hasAiCollege: '是否设有人工智能学院',
  hasDoctorate: '是否拥有博士点',
  nsfcProjects: '国家自然科学基金项目',
  keyLab: '重点实验室',
  // aiEducationStatus
  hasAiCourse: '是否已开设 AI 课程',
  courseMode: '课程模式',
  platform: '平台情况',
  teacherCount: '师资数量',
  // decision chain
  decisionMaker: '决策人',
  influencer: '影响者',
  gatekeeper: '把关人',
  user: '使用部门',
  coach: '内部教练',
  // timeWindow
  fiscalYearEnd: '财年截止',
  budgetStatus: '预算状态',
  procurementSeason: '采购季',
  // painPoints
  symptoms: '症状',
  rootCause: '根因',
  urgency: '紧迫度',
  // visitStrategy
  keyMessage: '关键信息',
  proofPoint: '佐证材料',
  nextStep: '下一步',
  // visit_analysis
  summary: '摘要',
  qualityScore: '质量评分',
  total: '总分',
  goalAchievement: '目标达成',
  infoIncrement: '信息增量',
  relationshipProgress: '关系推进',
  riskAvoidance: '风险规避',
  spinAssessment: 'SPIN 评估',
  // visit_preparation
  companyName: '客户名称',
  currentStage: '当前阶段',
  healthScore: '健康度',
  keyContacts: '关键联系人',
  visitAgenda: '拜访议程',
  objectionLibrary: '异议库',
  skuStrategy: '产品策略',
  materialChecklist: '物料清单',
  riskAlerts: '风险提示',
  // team_management
  pipelineOverview: 'Pipeline 概览',
  activeProjects: '活跃商机',
  avgHealthScore: '平均健康度',
  riskTop5: '风险 TOP5',
  // lead_assessment
  scoreOverview: '评分概览',
  conversionRoadmap: '转化路径',
  // territory_expansion
  targetAnalysis: '目标分析',
  touchPlan: '触达计划',
  sideFlankStrategy: '侧翼包抄策略',
  doorOpener: '价值敲门砖',
  scripts: '实战话术',
  segment: '目标细分',
  entryPoint: '切入点',
  valueProposition: '价值主张',
  gatekeeperStrategy: '门卫突破策略',
  weakLink: '薄弱环节',
  approach: '包抄路径',
  leverage: '杠杆点',
  asset: '敲门砖内容',
  delivery: '交付方式',
  followUp: '跟进策略',
  coldCall: '陌拜话术',
  referral: '转介绍话术',
  valueFirst: '价值先行话术',
  // general
  name: '名称',
  position: '职位',
  department: '部门',
  email: '邮箱',
  phone: '电话',
  wechat: '微信',
  field: '字段',
  url: '链接',
}

function formatLabel(key: string): string {
  if (LABEL_MAP[key]) return LABEL_MAP[key]
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, ' ')
}

function getScoreColor(value: number): string {
  if (value >= 80) return 'bg-success'
  if (value >= 60) return 'bg-warning'
  if (value >= 40) return 'bg-orange-400'
  return 'bg-danger'
}

function getBadgeColor(value: string): string {
  const v = value.toLowerCase()
  if (['优秀', '积极', '健康', '高', '已完成', 'a级', 'urgent', '紧急'].includes(v)) return 'bg-success/10 text-success border-success/20'
  if (['良好', '中立偏积极', '需关注', '中', '进行中', 'b级'].includes(v)) return 'bg-warning/10 text-warning border-warning/20'
  if (['一般', '消极', '假积极', '低风险', '未开始', 'c级'].includes(v)) return 'bg-orange-400/10 text-orange-400 border-orange-400/20'
  if (['不足', '高风险', '严重落后', '疑似幻盘', 'critical'].includes(v)) return 'bg-danger/10 text-danger border-danger/20'
  return 'bg-surface-elevated text-text-secondary border-border'
}

function ScoreBar({ value, max = 100, label }: { value: number; max?: number; label?: string }): React.ReactNode {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="space-y-1">
      {label && <div className="flex justify-between text-xs text-text-secondary"><span>{label}</span><span>{value}/{max}</span></div>}
      <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
        <div className={`h-full rounded-full transition-all ${getScoreColor(pct)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Badge({ value }: { value: string }): React.ReactNode {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getBadgeColor(value)}`}>
      {value}
    </span>
  )
}

function CollapsibleSection({ title, children, icon: Icon, defaultOpen = false }: { title: string; children: React.ReactNode; icon?: React.ElementType; defaultOpen?: boolean }): React.ReactNode {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-surface-elevated/50 transition-colors">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          {Icon && <Icon size={14} className="text-primary" />}
          {title}
        </div>
        {open ? <ChevronUp size={14} className="text-text-secondary" /> : <ChevronDown size={14} className="text-text-secondary" />}
      </button>
      {open && <div className="border-t border-border px-3 py-2">{children}</div>}
    </div>
  )
}

function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-text-tertiary">—</span>

  if (typeof value === 'boolean') return <Badge value={value ? '是' : '否'} />

  if (typeof value === 'number') {
    // Heuristic: 0-100 scores
    if (value >= 0 && value <= 100 && Number.isInteger(value)) {
      return <ScoreBar value={value} />
    }
    return <span className="text-sm font-medium text-text-primary">{value}</span>
  }

  if (typeof value === 'string') {
    // Heuristic: enum/badges
    if (value.length <= 10 && /^(优秀|良好|一般|不足|积极|中立|消极|假积极|高|中|低|健康|需关注|高风险|已完成|进行中|未开始|A级|B级|C级|紧急|中等|长期|紧迫)$/u.test(value)) {
      return <Badge value={value} />
    }
    // Long text
    if (value.length > 60) {
      return <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed break-words">{value}</p>
    }
    return <span className="text-sm text-text-primary break-words">{value}</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-xs text-text-tertiary">无数据</span>

    // Array of objects → flat cards
    if (typeof value[0] === 'object' && value[0] !== null) {
      return (
        <div className="space-y-1.5">
          {value.map((item, idx) => (
            <div key={idx} className="rounded-md bg-surface-elevated/60 p-2">
              <JsonObject obj={item as Record<string, unknown>} depth={depth + 1} />
            </div>
          ))}
        </div>
      )
    }

    // Array of primitives → tag list
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((item, idx) => (
          <span key={idx} className="inline-flex items-center rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary">
            {String(item)}
          </span>
        ))}
      </div>
    )
  }

  // Object
  return <JsonObject obj={value as Record<string, unknown>} depth={depth + 1} />
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return true
    const placeholders = ['无法计算', '未明确', '无数据', '无季度目标数据', 'n/a', 'N/A', '—', '-', '暂未检索到', '需拜访确认', '未找到', '未知', '暂无', '待确认', '信息未公开', '未公布']
    if (placeholders.includes(trimmed)) return true
  }
  if (Array.isArray(value) && value.length === 0) return true
  if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) return true
  return false
}

function JsonObject({ obj, depth = 0 }: { obj: Record<string, unknown>; depth?: number }): React.ReactNode {
  const entries = Object.entries(obj).filter(([, val]) => !isEmptyValue(val))
  if (entries.length === 0) return <span className="text-xs text-text-tertiary">无数据</span>

  return (
    <div className="grid gap-2 grid-cols-1">
      {entries.map(([key, val]) => {
        const label = formatLabel(key)
        // Special rendering for known score fields
        if (typeof val === 'number' && key.toLowerCase().includes('score') && val >= 0 && val <= 100) {
          return (
            <div key={key} className="sm:col-span-2">
              <div className="mb-1 text-xs text-text-secondary">{label}</div>
              <ScoreBar value={val} label={label} />
            </div>
          )
        }
        return (
          <div key={key} className="space-y-1 min-w-0">
            <div className="text-xs text-text-secondary break-words">{label}</div>
            <JsonValue value={val} depth={depth} />
          </div>
        )
      })}
    </div>
  )
}

// ── Intent-specific renderers ──

function VisitAnalysisRenderer({ data }: { data: Record<string, unknown> }) {
  const summary = data.summary as string
  const quality = data.qualityScore as Record<string, unknown> | undefined
  const spin = data.spinAssessment as Record<string, unknown> | undefined

  return (
    <div className="space-y-3">
      {summary && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <Activity size={14} />
            拜访摘要
          </div>
          <p className="mt-1 text-sm text-text-primary">{summary}</p>
        </div>
      )}

      {quality && (
        <CollapsibleSection title="拜访质量评分" icon={Target} defaultOpen>
          <div className="space-y-3">
            {typeof quality.total === 'number' && <ScoreBar value={quality.total} max={100} label="总分" />}
            <div className="grid grid-cols-1 gap-2">
              {['goalAchievement', 'infoIncrement', 'relationshipProgress', 'riskAvoidance'].map((k) => {
                const v = quality[k]
                if (typeof v === 'number') {
                  return <ScoreBar key={k} value={v} max={25} label={formatLabel(k)} />
                }
                return null
              })}
            </div>
            {typeof quality.level === 'string' && <div className="flex items-center gap-2 text-sm">等级: <Badge value={quality.level} /></div>}
          </div>
        </CollapsibleSection>
      )}

      {spin && (
        <CollapsibleSection title="SPIN 评估" icon={TrendingUp}>
          <div className="divide-y divide-border">
            {Object.entries(spin).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                <span className="text-xs text-text-secondary">{formatLabel(k)}</span>
                {typeof v === 'string' ? <Badge value={v} /> : <span className="text-sm text-text-primary">{String(v)}</span>}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

    </div>
  )
}

function TeamManagementRenderer({ data }: { data: Record<string, unknown> }) {
  const overview = data.pipelineOverview as Record<string, unknown> | undefined
  const riskTop5 = data.riskTop5 as Array<Record<string, unknown>> | undefined

  return (
    <div className="space-y-3">
      {overview && (
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg border border-border bg-surface p-2 text-center">
            <div className="text-lg font-bold text-primary">{String(overview.activeProjects ?? '—')}</div>
            <div className="text-xs text-text-secondary">活跃商机</div>
          </div>
          <div className="flex-1 rounded-lg border border-border bg-surface p-2 text-center">
            <div className="text-lg font-bold text-primary">{String(overview.avgHealthScore ?? '—')}</div>
            <div className="text-xs text-text-secondary">平均健康度</div>
          </div>
        </div>
      )}

      {riskTop5 && riskTop5.length > 0 && (
        <CollapsibleSection title={`风险项目 TOP${riskTop5.length}`} icon={AlertTriangle} defaultOpen>
          <div className="divide-y divide-border">
            {riskTop5.map((item, idx) => (
              <div key={idx} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-sm font-medium text-text-primary break-words">{String(item.projectName ?? '未知项目')}</span>
                  {typeof item.healthScore === 'number' && <Badge value={`${item.healthScore}分`} />}
                </div>
                <div className="mt-0.5 text-xs text-text-secondary">
                  负责人: {String(item.owner ?? '—')} · 阶段: {String(item.stage ?? '—')}
                </div>
                {typeof item.suggestedAction === 'string' && item.suggestedAction && (
                  <div className="mt-0.5 text-xs text-danger">建议: {String(item.suggestedAction)}</div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}

function BackgroundResearchRenderer({ data }: { data: Record<string, unknown> }) {
  const profile = data.customerProfile as Record<string, unknown> | undefined
  const sources = data.sources as Array<Record<string, unknown>> | undefined
  const decisionChain = data.decisionChain as Record<string, unknown> | undefined
  const painPoints = data.painPoints as Array<Record<string, unknown>> | undefined
  const timeWindow = data.timeWindow as Record<string, unknown> | undefined
  const policyLevers = data.policyLevers as Array<Record<string, unknown>> | undefined
  const risksAndOpportunities = data.risksAndOpportunities as Record<string, unknown> | undefined
  const visitStrategy = data.visitStrategy as Record<string, unknown> | undefined

  const hasProfileData = profile && Object.entries(profile).some(([k, v]) => k !== 'productMatch' && !isEmptyValue(v))

  return (
    <div className="space-y-3">
      {/* 产品匹配 */}
      {!!profile?.productMatch && !isEmptyValue(profile.productMatch) && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Target size={14} />
            匹配产品: <Badge value={String(profile.productMatch)} />
          </div>
        </div>
      )}

      {/* 客户画像 */}
      {hasProfileData && (
        <CollapsibleSection title="客户画像" icon={Users} defaultOpen>
          <div className="space-y-3">
            {!!profile?.basicInfo && (
              <div>
                <div className="mb-1 text-xs font-medium text-text-primary">基本信息</div>
                <JsonObject obj={profile.basicInfo as Record<string, unknown>} />
              </div>
            )}
            {!!profile?.aiEducationStatus && (
              <div>
                <div className="mb-1 text-xs font-medium text-text-primary">AI 教育现状</div>
                <JsonObject obj={profile.aiEducationStatus as Record<string, unknown>} />
              </div>
            )}
            {!!profile?.researchStrength && (
              <div>
                <div className="mb-1 text-xs font-medium text-text-primary">科研实力</div>
                <JsonObject obj={profile.researchStrength as Record<string, unknown>} />
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* 数据来源 */}
      {!!sources && sources.length > 0 && (
        <CollapsibleSection title={`数据来源 (${sources.length})`} icon={Info}>
          <div className="divide-y divide-border">
            {sources.map((s, idx) => (
              <div key={idx} className="py-2 first:pt-0 last:pb-0">
                <div className="text-xs font-medium text-text-primary break-words">{String(s.field ?? '—')}</div>
                {!!s.url && String(s.url).startsWith('http') && (
                  <a href={String(s.url)} target="_blank" rel="noreferrer" className="mt-0.5 block text-[10px] text-primary truncate hover:underline">
                    {String(s.url)}
                  </a>
                )}
                {!!s.summary && !isEmptyValue(s.summary) && (
                  <p className="mt-0.5 text-xs text-text-secondary">{String(s.summary)}</p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 决策链 */}
      {decisionChain && Object.keys(decisionChain).length > 0 && (
        <CollapsibleSection title="决策链" icon={Target}>
          <div className="space-y-2">
            {Object.entries(decisionChain).filter(([, v]) => !isEmptyValue(v)).map(([key, val]) => (
              <div key={key}>
                <div className="mb-1 text-xs font-medium text-text-primary">{formatLabel(key)}</div>
                {typeof val === 'object' && val !== null ? (
                  <JsonObject obj={val as Record<string, unknown>} />
                ) : (
                  <span className="text-sm text-text-primary">{String(val)}</span>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 时间窗口 */}
      {timeWindow && Object.keys(timeWindow).length > 0 && (
        <CollapsibleSection title="时间窗口与预算" icon={Calendar}>
          <JsonObject obj={timeWindow} />
        </CollapsibleSection>
      )}

      {/* 痛点信号 */}
      {painPoints && painPoints.length > 0 && (
        <CollapsibleSection title={`痛点信号 (${painPoints.length})`} icon={AlertTriangle}>
          <div className="divide-y divide-border">
            {painPoints.map((p, idx) => (
              <div key={idx} className="py-2 first:pt-0 last:pb-0">
                <JsonObject obj={p} />
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 政策杠杆 */}
      {policyLevers && policyLevers.length > 0 && (
        <CollapsibleSection title={`政策杠杆 (${policyLevers.length})`} icon={TrendingUp}>
          <div className="divide-y divide-border">
            {policyLevers.map((pl, idx) => (
              <div key={idx} className="py-2 first:pt-0 last:pb-0">
                <JsonObject obj={pl} />
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 风险与机会 */}
      {risksAndOpportunities && Object.keys(risksAndOpportunities).length > 0 && (
        <CollapsibleSection title="风险与机会" icon={AlertTriangle}>
          <JsonObject obj={risksAndOpportunities} />
        </CollapsibleSection>
      )}

      {/* 拜访策略 */}
      {visitStrategy && Object.keys(visitStrategy).length > 0 && (
        <CollapsibleSection title="拜访策略建议" icon={CheckSquare}>
          <JsonObject obj={visitStrategy} />
        </CollapsibleSection>
      )}
    </div>
  )
}

function VisitPreparationRenderer({ data }: { data: Record<string, unknown> }) {
  const brief = data.customerBrief as Record<string, unknown> | undefined
  const agenda = data.visitAgenda as Record<string, unknown> | undefined
  const objections = data.objectionLibrary as Array<Record<string, unknown>> | undefined
  const sku = data.skuStrategy as Record<string, unknown> | undefined
  const checklist = data.materialChecklist as Array<Record<string, unknown>> | undefined
  const risks = data.riskAlerts as string[] | undefined

  return (
    <div className="space-y-3">
      {/* 客户速览 */}
      {brief && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Users size={14} />
            客户速览 · {String(brief.companyName ?? '—')}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
            {typeof brief.currentStage === 'string' && (
              <div><span className="text-text-secondary">阶段:</span> <Badge value={brief.currentStage} /></div>
            )}
            {typeof brief.healthScore === 'number' && (
              <div className="flex items-center gap-1"><span className="text-text-secondary">健康度:</span> <ScoreBar value={brief.healthScore} /></div>
            )}
          </div>
          {Array.isArray(brief.keyContacts) && brief.keyContacts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {brief.keyContacts.map((c: Record<string, unknown>, i: number) => (
                <span key={i} className="inline-flex items-center rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary">
                  {String(c.name ?? '—')} {c.position ? `· ${String(c.position)}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 拜访议程 */}
      {agenda && (
        <CollapsibleSection title={`拜访议程 · ${agenda.objective || '确认需求'}`} icon={Calendar} defaultOpen>
          <div className="space-y-2">
            {typeof agenda.duration === 'string' && (
              <div className="text-xs text-text-secondary">建议时长: {agenda.duration}</div>
            )}
            {Array.isArray(agenda.phases) && agenda.phases.map((phase: Record<string, unknown>, idx: number) => (
              <div key={idx} className="rounded-md bg-surface-elevated/60 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">{String(phase.phase ?? `阶段 ${idx + 1}`)}</span>
                  <span className="text-xs text-text-tertiary">{String(phase.duration ?? '')}</span>
                </div>
                {Array.isArray(phase.keyActions) && phase.keyActions.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {phase.keyActions.map((a: unknown, i: number) => (
                      <span key={i} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{String(a)}</span>
                    ))}
                  </div>
                )}
                {Array.isArray(phase.talkingPoints) && phase.talkingPoints.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {phase.talkingPoints.slice(0, 2).map((t: unknown, i: number) => (
                      <p key={i} className="text-xs text-text-secondary">• {String(t)}</p>
                    ))}
                    {phase.talkingPoints.length > 2 && (
                      <p className="text-[10px] text-text-tertiary">+{phase.talkingPoints.length - 2} 条话术</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 异议库 */}
      {objections && objections.length > 0 && (
        <CollapsibleSection title={`异议应对手册 (${objections.length}条)`} icon={AlertTriangle}>
          <div className="divide-y divide-border">
            {objections.map((obj: Record<string, unknown>, idx: number) => (
              <div key={idx} className="py-2 first:pt-0 last:pb-0">
                <div className="text-xs font-medium text-text-primary">{String(obj.objection ?? '—')}</div>
                <div className="mt-0.5 text-xs text-text-secondary">{String(obj.response ?? '—')}</div>
                {typeof obj.underlyingConcern === 'string' && (
                  <div className="mt-0.5 text-[10px] text-text-tertiary">底层顾虑: {obj.underlyingConcern}</div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 产品策略 */}
      {sku && (
        <CollapsibleSection title="产品策略" icon={Target}>
          <div className="space-y-2 text-sm">
            {typeof sku.recommendedSku === 'string' && (
              <div className="flex items-center gap-2"><span className="text-text-secondary">主推:</span> <Badge value={sku.recommendedSku} /></div>
            )}
            {typeof sku.keyValueProp === 'string' && (
              <p className="text-text-secondary">{sku.keyValueProp}</p>
            )}
            {Array.isArray(sku.demoPoints) && sku.demoPoints.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {sku.demoPoints.map((d: unknown, i: number) => (
                  <span key={i} className="rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] text-success">{String(d)}</span>
                ))}
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* 物料清单 */}
      {checklist && checklist.length > 0 && (
        <CollapsibleSection title="物料检查清单" icon={CheckSquare}>
          <div className="divide-y divide-border">
            {checklist.map((item: Record<string, unknown>, idx: number) => (
              <div key={idx} className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                <span className="text-xs text-text-primary">{String(item.item ?? '—')}</span>
                <Badge value={String(item.status ?? '待确认')} />
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 风险提示 */}
      {risks && risks.length > 0 && (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-danger">
            <AlertTriangle size={12} />
            风险提示
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-text-secondary">
            {risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function TerritoryExpansionRenderer({ data }: { data: Record<string, unknown> }) {
  const target = data.targetAnalysis as Record<string, string> | undefined
  const touch = data.touchPlan as Record<string, unknown> | undefined
  const sideFlank = data.sideFlankStrategy as Record<string, string> | undefined
  const door = data.doorOpener as Record<string, string> | undefined
  const scripts = data.scripts as Record<string, string[]> | undefined

  const phases = touch
    ? ['phase1', 'phase2', 'phase3'].map((k) => {
        const p = touch[k] as Record<string, unknown> | undefined
        if (!p) return null
        return {
          name: String(p.name ?? '—'),
          actions: Array.isArray(p.actions) ? p.actions as string[] : [],
          timeframe: String(p.timeframe ?? ''),
        }
      }).filter(Boolean)
    : []

  return (
    <div className="space-y-3">
      {/* 目标分析 */}
      {target && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <Target size={14} /> 目标分析
          </div>
          {target.segment && (
            <div className="text-xs"><span className="text-text-secondary">目标细分:</span> <span className="text-text-primary font-medium">{target.segment}</span></div>
          )}
          {target.entryPoint && (
            <div className="text-xs"><span className="text-text-secondary">切入点:</span> <span className="text-text-primary">{target.entryPoint}</span></div>
          )}
          {target.valueProposition && (
            <div className="text-xs"><span className="text-text-secondary">价值主张:</span> <span className="text-text-primary">{target.valueProposition}</span></div>
          )}
          {target.gatekeeperStrategy && (
            <div className="text-xs"><span className="text-text-secondary">突破策略:</span> <span className="text-text-primary">{target.gatekeeperStrategy}</span></div>
          )}
        </div>
      )}

      {/* 触达计划时间线 */}
      {phases.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-text-secondary">触达计划</div>
          <div className="space-y-2">
            {phases.map((phase, idx) => phase && (
              <div key={idx} className="flex gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">{idx + 1}</div>
                  {idx < phases.length - 1 && <div className="w-px flex-1 bg-border"></div>}
                </div>
                <div className="flex-1 rounded-md border border-border bg-surface p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-primary">{phase.name}</span>
                    {phase.timeframe && <span className="text-[10px] text-text-tertiary">{phase.timeframe}</span>}
                  </div>
                  {phase.actions.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-3 text-[10px] text-text-secondary">
                      {phase.actions.map((a, i) => (
                        <li key={i} className="break-words">{a}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 侧翼包抄 + 敲门砖 */}
      {(sideFlank || door) && (
        <div className="grid grid-cols-1 gap-2">
          {sideFlank && (
            <div className="rounded-md bg-surface-elevated/60 p-2 space-y-1">
              <div className="text-xs font-medium text-text-primary">侧翼包抄</div>
              {sideFlank.weakLink && <div className="text-[10px] text-text-secondary"><span className="text-text-tertiary">薄弱环节:</span> {sideFlank.weakLink}</div>}
              {sideFlank.approach && <div className="text-[10px] text-text-secondary"><span className="text-text-tertiary">包抄路径:</span> {sideFlank.approach}</div>}
              {sideFlank.leverage && <div className="text-[10px] text-text-secondary"><span className="text-text-tertiary">杠杆点:</span> {sideFlank.leverage}</div>}
            </div>
          )}
          {door && (
            <div className="rounded-md bg-surface-elevated/60 p-2 space-y-1">
              <div className="text-xs font-medium text-text-primary">价值敲门砖</div>
              {door.asset && <div className="text-[10px] text-text-secondary"><span className="text-text-tertiary">内容:</span> {door.asset}</div>}
              {door.delivery && <div className="text-[10px] text-text-secondary"><span className="text-text-tertiary">交付:</span> {door.delivery}</div>}
              {door.followUp && <div className="text-[10px] text-text-secondary"><span className="text-text-tertiary">跟进:</span> {door.followUp}</div>}
            </div>
          )}
        </div>
      )}

      {/* 实战话术 */}
      {scripts && (
        <div className="space-y-2">
          {scripts.coldCall && scripts.coldCall.length > 0 && (
            <CollapsibleSection title={`陌拜话术 (${scripts.coldCall.length})`} icon={MessageSquare} defaultOpen>
              <ul className="list-disc space-y-1 pl-4 text-xs text-text-secondary">
                {scripts.coldCall.map((s, i) => <li key={i} className="break-words">{s}</li>)}
              </ul>
            </CollapsibleSection>
          )}
          {scripts.referral && scripts.referral.length > 0 && (
            <CollapsibleSection title={`转介绍话术 (${scripts.referral.length})`} icon={Users}>
              <ul className="list-disc space-y-1 pl-4 text-xs text-text-secondary">
                {scripts.referral.map((s, i) => <li key={i} className="break-words">{s}</li>)}
              </ul>
            </CollapsibleSection>
          )}
          {scripts.valueFirst && scripts.valueFirst.length > 0 && (
            <CollapsibleSection title={`价值先行话术 (${scripts.valueFirst.length})`} icon={TrendingUp}>
              <ul className="list-disc space-y-1 pl-4 text-xs text-text-secondary">
                {scripts.valueFirst.map((s, i) => <li key={i} className="break-words">{s}</li>)}
              </ul>
            </CollapsibleSection>
          )}
        </div>
      )}

    </div>
  )
}

export function StructuredOutputRenderer({ json, intent }: { json: unknown; intent: string | null }) {
  if (!json || typeof json !== 'object') return null

  const data = json as Record<string, unknown>

  if (intent === 'visit_analysis') return <VisitAnalysisRenderer data={data} />
  if (intent === 'team_management') return <TeamManagementRenderer data={data} />
  if (intent === 'background_research') return <BackgroundResearchRenderer data={data} />
  if (intent === 'visit_preparation') return <VisitPreparationRenderer data={data} />
  if (intent === 'territory_expansion') return <TerritoryExpansionRenderer data={data} />

  // Fallback: generic renderer
  return <JsonObject obj={data} />
}
