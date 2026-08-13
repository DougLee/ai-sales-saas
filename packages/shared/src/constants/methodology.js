/**
 * 销售方法论共享常量
 * 与 backend/src/knowledgeBase/data/methodology.js 保持同步
 */

const VERSION = '2.3.0';

const MILESTONES = [
  {
    index: 1,
    name: '初识客户',
    description: '建立初步联系，了解客户基本信息',
    thresholds: { maxDays: 7, minContacts: 1 },
  },
  {
    index: 2,
    name: '明确痛点',
    description: '识别并确认客户的核心业务痛点',
    thresholds: { maxDays: 14, minVisits: 1 },
  },
  {
    index: 3,
    name: '需求确认',
    description: '明确客户需求范围与优先级',
    thresholds: { maxDays: 21, minVisits: 2 },
  },
  {
    index: 4,
    name: '方案设计',
    description: '制定针对性解决方案',
    thresholds: { maxDays: 30, minVisits: 2 },
  },
  {
    index: 5,
    name: '方案演示',
    description: '向客户展示解决方案',
    thresholds: { maxDays: 45, minVisits: 3 },
  },
  {
    index: 6,
    name: '商务谈判',
    description: '价格、条款、交付方式谈判',
    thresholds: { maxDays: 60, minVisits: 3 },
  },
  {
    index: 7,
    name: '协助采购',
    description: '协助客户完成内部采购流程',
    thresholds: { maxDays: 90, minVisits: 4 },
  },
  {
    index: 8,
    name: '合同签署',
    description: '正式签订合同',
    thresholds: { maxDays: 120, minVisits: 4 },
  },
  {
    index: 9,
    name: '交付回款',
    description: '项目交付与尾款回收',
    thresholds: { maxDays: 180, minVisits: 5 },
  },
];

const DECISION_ROLES = {
  Coach: {
    name: '教练/内线',
    description: '愿意提供信息、指引方向',
    characteristics: ['主动分享内部信息', '愿意引荐关键人'],
  },
  Evaluator: {
    name: '评估者/技术把关',
    description: '负责技术评估与方案筛选',
    characteristics: ['关注技术细节', '横向对比供应商'],
  },
  DecisionMaker: {
    name: '最终决策者',
    description: '拥有最终拍板权',
    characteristics: ['关注ROI与战略匹配', '对价格敏感但非唯一因素'],
  },
};

const SALES_PHILOSOPHY = {
  core: [
    '以客户成功为中心，而非以签单为中心',
    '信息不对称是利润来源，信任是消除不对称的桥梁',
    '销售的本质是价值传递，不是产品推销',
  ],
  keyMetrics: ['赢单率', '平均成交周期', '客单价', '客户满意度', '复购率'],
};

/**
 * 验证配置完整性
 * @param {any} config
 * @returns {string[]}
 */
function validateConfig(config) {
  const errors = [];
  if (!config) {
    errors.push('配置为空');
    return errors;
  }
  if (!Array.isArray(config.milestones) || config.milestones.length !== 9) {
    errors.push('milestones 必须是长度为9的数组');
  }
  if (!config.decisionRoles || typeof config.decisionRoles !== 'object') {
    errors.push('decisionRoles 必须是一个对象');
  }
  return errors;
}

module.exports = {
  VERSION,
  MILESTONES,
  DECISION_ROLES,
  SALES_PHILOSOPHY,
  validateConfig,
};
