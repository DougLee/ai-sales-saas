/**
 * Activity Feed 事件类型与元数据定义
 *
 * 统一 TimelineEvent.eventType 的取值，避免字符串拼写不一致。
 * 所有需要写入客户/项目动态流的事件都应使用此处定义的常量。
 */

export const ActivityEventType = {
  // 客户/公司相关
  COMPANY_CREATED: 'COMPANY_CREATED',
  COMPANY_UPDATED: 'COMPANY_UPDATED',
  COMPANY_OWNER_CHANGED: 'COMPANY_OWNER_CHANGED',
  COMPANY_ASSIGNED: 'COMPANY_ASSIGNED',
  COMPANY_STATUS_CHANGED: 'COMPANY_STATUS_CHANGED',

  // 联系人相关
  CONTACT_CREATED: 'CONTACT_CREATED',
  CONTACT_UPDATED: 'CONTACT_UPDATED',
  PROJECT_CONTACT_CREATED: 'PROJECT_CONTACT_CREATED',
  PROJECT_CONTACT_UPDATED: 'PROJECT_CONTACT_UPDATED',
  DECISION_MAP_CHANGED: 'DECISION_MAP_CHANGED',

  // 线索相关
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_UPDATED: 'LEAD_UPDATED',
  LEAD_FOLLOW_UP_CREATED: 'LEAD_FOLLOW_UP_CREATED',
  LEAD_CONVERTED: 'LEAD_CONVERTED',
  LEAD_LOST: 'LEAD_LOST',
  LEAD_OWNER_CHANGED: 'LEAD_OWNER_CHANGED',

  // 商机/项目相关
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_CLOSED: 'PROJECT_CLOSED',
  PROJECT_OWNER_CHANGED: 'PROJECT_OWNER_CHANGED',
  MILESTONE_ADVANCED: 'MILESTONE_ADVANCED',
  MILESTONE_GATE_PASSED: 'MILESTONE_GATE_PASSED',
  HEALTH_SCORE_CHANGED: 'HEALTH_SCORE_CHANGED',
  WIN_PROBABILITY_CHANGED: 'WIN_PROBABILITY_CHANGED',
  PROJECT_STALE_MARKED: 'PROJECT_STALE_MARKED',
  PROJECT_STALE_RECOVERED: 'PROJECT_STALE_RECOVERED',
  PROJECT_WAITING_MARKED: 'PROJECT_WAITING_MARKED',
  PROJECT_WAITING_CLEARED: 'PROJECT_WAITING_CLEARED',

  // 拜访相关
  VISIT_CREATED: 'VISIT_CREATED',
  VISIT_UPDATED: 'VISIT_UPDATED',
  VISIT_COMPLETED: 'VISIT_COMPLETED',
  VISIT_AI_ANALYZED: 'VISIT_AI_ANALYZED',
  VISIT_CONFIRMED: 'VISIT_CONFIRMED',
  VISIT_MILESTONE_CHANGED: 'VISIT_MILESTONE_CHANGED',

  // 任务相关
  TASK_CREATED: 'TASK_CREATED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_OVERDUE: 'TASK_OVERDUE',
  TASK_DEADLINE_CHANGED: 'TASK_DEADLINE_CHANGED',

  // AI / 系统
  AI_ANALYSIS_COMPLETED: 'AI_ANALYSIS_COMPLETED',
  SYSTEM_STALE_SCAN: 'SYSTEM_STALE_SCAN',
} as const

export type ActivityEventType =
  (typeof ActivityEventType)[keyof typeof ActivityEventType]

export interface ActivityMeta {
  /** 前端显示用的事件标题模板，支持 {{key}} 占位符 */
  titleTemplate: string
  /** 事件所属业务域，用于前端图标/颜色分类 */
  category: 'company' | 'contact' | 'lead' | 'project' | 'visit' | 'task' | 'system' | 'ai'
  /** 是否属于需要销售主动关注的动作 */
  isAction: boolean
}

const METADATA: Record<ActivityEventType, ActivityMeta> = {
  [ActivityEventType.COMPANY_CREATED]: {
    titleTemplate: '创建客户 {{name}}',
    category: 'company',
    isAction: true,
  },
  [ActivityEventType.COMPANY_UPDATED]: {
    titleTemplate: '更新客户信息',
    category: 'company',
    isAction: false,
  },
  [ActivityEventType.COMPANY_OWNER_CHANGED]: {
    titleTemplate: '客户负责人变更为 {{ownerName}}',
    category: 'company',
    isAction: true,
  },
  [ActivityEventType.COMPANY_ASSIGNED]: {
    titleTemplate: '认领客户 {{name}}',
    category: 'company',
    isAction: true,
  },
  [ActivityEventType.COMPANY_STATUS_CHANGED]: {
    titleTemplate: '客户状态从 {{from}} 变更为 {{to}}',
    category: 'company',
    isAction: true,
  },

  [ActivityEventType.CONTACT_CREATED]: {
    titleTemplate: '新增联系人 {{name}}',
    category: 'contact',
    isAction: true,
  },
  [ActivityEventType.CONTACT_UPDATED]: {
    titleTemplate: '更新联系人 {{name}} 信息',
    category: 'contact',
    isAction: false,
  },
  [ActivityEventType.PROJECT_CONTACT_CREATED]: {
    titleTemplate: '项目新增决策链联系人 {{name}}',
    category: 'contact',
    isAction: true,
  },
  [ActivityEventType.PROJECT_CONTACT_UPDATED]: {
    titleTemplate: '更新决策链联系人 {{name}}',
    category: 'contact',
    isAction: false,
  },
  [ActivityEventType.DECISION_MAP_CHANGED]: {
    titleTemplate: '决策链图谱更新',
    category: 'contact',
    isAction: true,
  },

  [ActivityEventType.LEAD_CREATED]: {
    titleTemplate: '新建线索 {{name}}',
    category: 'lead',
    isAction: true,
  },
  [ActivityEventType.LEAD_UPDATED]: {
    titleTemplate: '更新线索信息',
    category: 'lead',
    isAction: false,
  },
  [ActivityEventType.LEAD_FOLLOW_UP_CREATED]: {
    titleTemplate: '线索跟进：{{content}}',
    category: 'lead',
    isAction: true,
  },
  [ActivityEventType.LEAD_CONVERTED]: {
    titleTemplate: '线索转化为客户/商机',
    category: 'lead',
    isAction: true,
  },
  [ActivityEventType.LEAD_LOST]: {
    titleTemplate: '线索流失：{{reason}}',
    category: 'lead',
    isAction: true,
  },
  [ActivityEventType.LEAD_OWNER_CHANGED]: {
    titleTemplate: '线索负责人变更为 {{ownerName}}',
    category: 'lead',
    isAction: true,
  },

  [ActivityEventType.PROJECT_CREATED]: {
    titleTemplate: '创建商机 {{name}}',
    category: 'project',
    isAction: true,
  },
  [ActivityEventType.PROJECT_UPDATED]: {
    titleTemplate: '更新商机信息',
    category: 'project',
    isAction: false,
  },
  [ActivityEventType.PROJECT_CLOSED]: {
    titleTemplate: '关闭商机 {{name}}',
    category: 'project',
    isAction: true,
  },
  [ActivityEventType.PROJECT_OWNER_CHANGED]: {
    titleTemplate: '商机负责人变更为 {{ownerName}}',
    category: 'project',
    isAction: true,
  },
  [ActivityEventType.MILESTONE_ADVANCED]: {
    titleTemplate: '里程碑推进：{{from}} → {{to}}',
    category: 'project',
    isAction: true,
  },
  [ActivityEventType.MILESTONE_GATE_PASSED]: {
    titleTemplate: '通过里程碑 gate 校验：{{from}} → {{to}}',
    category: 'project',
    isAction: false,
  },
  [ActivityEventType.HEALTH_SCORE_CHANGED]: {
    titleTemplate: '健康度更新为 {{healthScore}}',
    category: 'project',
    isAction: false,
  },
  [ActivityEventType.WIN_PROBABILITY_CHANGED]: {
    titleTemplate: '赢单概率更新为 {{winProbability}}%',
    category: 'project',
    isAction: false,
  },
  [ActivityEventType.PROJECT_STALE_MARKED]: {
    titleTemplate: '项目被标记为停滞：{{reason}}',
    category: 'project',
    isAction: false,
  },
  [ActivityEventType.PROJECT_STALE_RECOVERED]: {
    titleTemplate: '项目停滞恢复',
    category: 'project',
    isAction: true,
  },
  [ActivityEventType.PROJECT_WAITING_MARKED]: {
    titleTemplate: '标记等待客户：{{waitingLabel}}',
    category: 'project',
    isAction: true,
  },
  [ActivityEventType.PROJECT_WAITING_CLEARED]: {
    titleTemplate: '解除等待客户，恢复跟进倒计时',
    category: 'project',
    isAction: true,
  },

  [ActivityEventType.VISIT_CREATED]: {
    titleTemplate: '创建拜访计划：{{visitTime}}',
    category: 'visit',
    isAction: true,
  },
  [ActivityEventType.VISIT_UPDATED]: {
    titleTemplate: '更新拜访信息',
    category: 'visit',
    isAction: false,
  },
  [ActivityEventType.VISIT_COMPLETED]: {
    titleTemplate: '完成拜访，生成总结',
    category: 'visit',
    isAction: true,
  },
  [ActivityEventType.VISIT_AI_ANALYZED]: {
    titleTemplate: 'AI 完成拜访分析',
    category: 'ai',
    isAction: false,
  },
  [ActivityEventType.VISIT_CONFIRMED]: {
    titleTemplate: '拜访内容已确认（{{confirmedCount}} 项）',
    category: 'visit',
    isAction: true,
  },
  [ActivityEventType.VISIT_MILESTONE_CHANGED]: {
    titleTemplate: '拜访触发里程碑变更：{{from}} → {{to}}',
    category: 'visit',
    isAction: true,
  },

  [ActivityEventType.TASK_CREATED]: {
    titleTemplate: '创建待办：{{title}}',
    category: 'task',
    isAction: true,
  },
  [ActivityEventType.TASK_COMPLETED]: {
    titleTemplate: '完成待办：{{title}}',
    category: 'task',
    isAction: true,
  },
  [ActivityEventType.TASK_OVERDUE]: {
    titleTemplate: '待办已逾期：{{title}}',
    category: 'task',
    isAction: false,
  },
  [ActivityEventType.TASK_DEADLINE_CHANGED]: {
    titleTemplate: '待办截止时间变更',
    category: 'task',
    isAction: false,
  },

  [ActivityEventType.AI_ANALYSIS_COMPLETED]: {
    titleTemplate: 'AI 分析完成：{{summary}}',
    category: 'ai',
    isAction: false,
  },
  [ActivityEventType.SYSTEM_STALE_SCAN]: {
    titleTemplate: '系统自动扫描：{{result}}',
    category: 'system',
    isAction: false,
  },
}

export function getActivityMeta(eventType: ActivityEventType): ActivityMeta {
  return (
    METADATA[eventType] || {
      titleTemplate: '发生事件 {{eventType}}',
      category: 'system',
      isAction: false,
    }
  )
}

/**
 * 简单模板渲染，用于服务端日志或非 React 场景。
 * 前端推荐使用组件级渲染以获得更好的链接/高亮能力。
 */
export function renderActivityTitle(
  eventType: ActivityEventType,
  data: Record<string, unknown> = {},
): string {
  const template = getActivityMeta(eventType).titleTemplate
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = data[key]
    return value != null ? String(value) : ''
  })
}
