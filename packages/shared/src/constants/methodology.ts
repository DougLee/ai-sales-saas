import type { MilestoneGateRule } from '../schemas/methodology.schema.js'

export const MILESTONE_NAMES = [
  '初识客户',
  '明确痛点',
  '明确需求',
  '明确经费',
  '明确方案',
  '明确价格',
  '协助采购',
  '招标确认',
  '投标中标',
] as const

export const DEFAULT_MILESTONE_GATE_RULES: MilestoneGateRule[] = [
  {
    fromStage: 0,
    requiredFields: [{ path: 'humanInfo.firstContact', label: '首次接触方式' }],
  },
  {
    fromStage: 1,
    requiredFields: [
      { path: 'humanInfo.painPoints', label: '痛点列表', validator: 'arrayMinLength', params: { min: 1 } },
    ],
  },
  {
    fromStage: 2,
    requiredFields: [{ path: 'businessInfo.requirements', label: '需求指标' }],
  },
  {
    fromStage: 3,
    requiredFields: [{ path: 'financeInfo.budget', label: '预算金额' }],
  },
  {
    fromStage: 4,
    requiredFields: [{ path: 'businessInfo.solution', label: '方案要点' }],
  },
  {
    fromStage: 5,
    requiredFields: [{ path: 'financeInfo.price', label: '报价金额' }],
  },
  {
    fromStage: 6,
    requiredFields: [{ path: 'decisionMap.nodes', label: '决策链人物', validator: 'arrayMinLength', params: { min: 1 } }],
  },
  {
    fromStage: 7,
    requiredFields: [{ path: 'evidence.bidResult', label: '中标结果' }],
  },
  {
    fromStage: 8,
    requiredFields: [],
  },
]

export const DECISION_ROLES = [
  { code: 'COACH', label: '引路人', weight: 30 },
  { code: 'EVALUATOR', label: '评估者', weight: 25 },
  { code: 'DECISION_MAKER', label: '决策者', weight: 45 },
] as const

export const SPIN_DIMENSIONS = [
  { code: 'SITUATION', label: '背景问题', purpose: '了解现状' },
  { code: 'PROBLEM', label: '难点问题', purpose: '挖掘痛点' },
  { code: 'IMPLICATION', label: '暗示问题', purpose: '放大影响' },
  { code: 'NEED_PAYOFF', label: '价值问题', purpose: '确认价值' },
] as const

// 7阶段销售业务流
export const SALES_STAGES = [
  { stage: 0, name: '战前准备', keyActions: ['目标院校筛选', '情报收集', '关系地图绘制'] },
  { stage: 1, name: '线索获取', keyActions: ['线索来源拓展', '线索四要素验证', '线索分级'] },
  { stage: 2, name: '初次接触', keyActions: ['触达四步法', '价值敲门砖', '建立初步信任'] },
  { stage: 3, name: '需求挖掘', keyActions: ['三层需求挖掘', 'SPIN提问', '隐性需求识别'] },
  { stage: 4, name: '方案呈现', keyActions: ['方案定制', 'Demo演示', '案例佐证'] },
  { stage: 5, name: '决策链运作', keyActions: ['角色覆盖', '态度管理', '异议处理'] },
  { stage: 6, name: '商务谈判', keyActions: ['报价策略', '条件交换', '合同条款'] },
  { stage: 7, name: '交付回款', keyActions: ['实施交付', '验收确认', '回款跟进'] },
  { stage: 8, name: '客户经营', keyActions: ['持续服务', '交叉销售', '口碑传播'] },
] as const

// 三层需求挖掘
export const DEMAND_MINING_LEVELS = [
  { level: 1, name: '表层需求', description: '客户直接说出来的需求，功能导向，同质化严重' },
  { level: 2, name: '隐性需求', description: '客户未直接表达但与痛点相关的需求，差异化切入点' },
  { level: 3, name: '战略需求', description: '与组织战略目标绑定的需求，决定预算优先级' },
] as const

// 四种性格类型
export const PERSONALITY_TYPES = [
  { code: 'TIGER', name: '老虎型', traits: '关注结果、效率、控制', approach: '先说结论、讲价值不讲细节、给选项' },
  { code: 'PEACOCK', name: '孔雀型', traits: '关注关系、认可、新鲜', approach: '多互动、多认可、用案例和故事' },
  { code: 'OWL', name: '猫头鹰型', traits: '关注细节、数据、逻辑', approach: '带足数据、准备好对比表、给思考时间' },
  { code: 'KOALA', name: '考拉型', traits: '关注稳定、安全、和谐', approach: '强调稳定性、给保障、不催促' },
] as const

// 触达节奏
export const TOUCH_RHYTHM = [
  { level: '高意向', frequency: '3-5天/次', content: '方案细节、演示安排、实施计划' },
  { level: '中意向', frequency: '1-2周/次', content: '行业资讯、案例分享、轻量价值' },
  { level: '低意向/休眠', frequency: '1月/次', content: '产品更新、行业趋势、节日问候' },
] as const
