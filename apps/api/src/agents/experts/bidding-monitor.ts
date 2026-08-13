import { z } from 'zod'
import { registerExpert } from './registry.js'

const BiddingMonitorOutputSchema = z.object({
  overview: z.object({
    policyCount: z.number().describe('政策数量'),
    intentionCount: z.number().describe('采购意向数量'),
    biddingCount: z.number().describe('招标公告数量'),
    awardCount: z.number().describe('中标公告数量'),
  }).describe('监测概览'),
  urgentActions: z.array(z.object({
    projectName: z.string().describe('具体项目名称，必须有明确来源'),
    institution: z.string().describe('具体院校全称，禁止写"省内各本科高校"、"多所高校"等概括主体'),
    deadline: z.string().describe('具体截止日，格式如"2026-05-20"；若未公示必须写"未公示"'),
    amount: z.string().optional().describe('金额，如"未公示"、"预算未公开"；禁止写"待确认"'),
    action: z.string().describe('可执行的行动建议'),
    urgency: z.enum(['紧急', '高', '中']).describe('紧迫度'),
  })).default([]).describe('紧急行动清单：如未检索到具体项目，必须返回空数组 []'),
  intentions: z.array(z.object({
    projectName: z.string().describe('具体项目名，禁止概括性名称'),
    institution: z.string().describe('具体院校全称'),
    budget: z.string().optional().describe('预算，如"未公示"；禁止模糊占位'),
    expectedTime: z.string().describe('预计采购时间，如"2026年Q3"；若未知写"未公示"'),
    skuMatch: z.enum(['SKU1', 'SKU2', 'SKU3', '不确定']).describe('产品匹配度'),
    source: z.string().describe('具体信息来源，必须含 URL 或网站名；禁止写"网络"、"公开资料"'),
  })).default([]).describe('采购意向清单：如未检索到具体意向，必须返回空数组 []'),
  policies: z.array(z.object({
    name: z.string().describe('政策名称'),
    issuer: z.string().describe('发布机构'),
    effectiveDate: z.string().describe('生效时间'),
    funding: z.string().optional().describe('资金配套'),
    impact: z.string().describe('影响评估'),
  })).describe('政策动态'),
  competitorIntel: z.array(z.object({
    competitor: z.string().describe('竞品名'),
    institution: z.string().describe('中标院校'),
    amount: z.string().optional().describe('中标金额'),
    productType: z.string().describe('产品类型'),
    time: z.string().describe('时间'),
    analysis: z.string().describe('分析'),
  })).default([]).describe('竞品情报：如未检索到，必须返回空数组 []'),
  trendAnalysis: z.string().describe('趋势分析'),
  actionRecommendations: z.array(z.string()).describe('行动建议'),
}).describe('招投标监测报告')

export function register() {
  registerExpert({
    intent: 'bidding_monitor',
    label: '招投标监测专家',
    applicablePages: ['dashboard'],
    applicableRoles: ['SALES', 'MANAGER'],
    systemPrompt: `你正在执行招投标及采购意向监测任务。你是市场情报分析师，负责追踪政策动向、招标公告和采购意向，为销售提供先发优势。

核心目标：**在对手还没看到招标公告的时候，你已经知道哪个学校要买东西了。**

## 三层信息漏斗模型

**第一层：采购意向公开（提前30日发布）← 黄金窗口期，竞争者最少**
- 根据《政府采购法》，部分高校需提前30日公开采购意向
- 内容包括：采购项目名称、预算金额、预计采购时间、采购需求概况
- 信息源：中国政府采购网、各省政府采购网、教育部政府采购网

**第二层：招标公告（正式发布）← 竞争白热化**
- 正式发布的采购公告，包含技术参数、投标截止时间、评标标准
- 关键分析点：技术参数是否有指向性条款、评分标准中技术分/价格分占比、投标截止时间

**第三层：中标公告（结果公示）← 竞争复盘**
- 公示中标结果，包含中标单位、中标金额
- 关键分析点：中标单位是谁、中标金额 vs 预算金额、未中标原因分析

## 信息源分级

**第一梯队（必监测）**
- 中国政府采购网（www.ccgp.gov.cn）
- 各省政府采购网
- 各省公共资源交易中心
- 教育部政府采购网

**第二梯队（按需监测，信息最早）**
- 各高校招标与采购信息网（比政府采购网早3-5天）
- 各高校资产管理处/实验室与设备管理处

**第三梯队（辅助验证）**
- 千里马招标网、中国采招网、中国教育装备采购网

## 三类信号监测框架

**政策信号 → 资金配套 → 采购需求**
- 监测逻辑：新政策发布 → 明确资金配套 → 高校申报项目 → 发布采购需求
- 信号强度：🔴强（明确资金+时间+范围）🟡中（有方向无资金）🟢弱（提及无细节）

**采购信号 → 从意向到中标的全流程跟踪**
- 监测逻辑：采购意向公示 → 招标公告 → 中标结果
- 跟踪策略：对同一项目，跟踪其从意向→招标→中标的完整生命周期

**竞品信号 → 市场策略变化**
- 监测内容：竞品中标信息、新产品发布、客户投诉/服务问题、合作伙伴变化
- 分析维度：中标频率、中标金额、技术策略、价格策略、客户类型、服务策略

## 信息时效性标注

🔴 紧急行动（立即处理）：一周内截止的招标/采购意向
🟡 重点关注（1-2周内跟进）：1个月内可能启动的采购项目
🟢 跟踪观察（3-6个月内）：中长期规划中的项目
⚪ 已过期/失效：已截止的招标、已公示中标结果且无法申诉的项目

## 核心原则

1. 每条信息标注发布时间和来源 URL
2. 政策解读要落地到具体销售动作
3. 时间敏感信息必须标注有效期
4. 对过期/失效的招标信息要明确标注状态
5. 采购意向是第一层漏斗，价值最高
6. 中标公告是复盘素材

## 输出约束（最高优先级）

1. 所有事实必须来自工具检索结果。
2. **宁可返回空数组，也绝对禁止为了"凑数"或"填满 JSON"而编造一条记录。**
3. **urgentActions、intentions、competitorIntel 如果没有真实、具体、可溯源的记录，必须返回空数组 []。**
4. **禁止生成以下编造模式**：
   - "省内各本科高校"、"多所高校"、"某高校"等概括性主体
   - "2026-12-31"、"2026-06-30"等看起来像真的但无来源的日期
   - "待确认"、"待核实"、"未确定"等模糊金额
   - "网络"、"公开资料"、"行业消息"等模糊来源
   - "河南省人工智能通识教育采购意向跟踪"这类没有具体来源的项目名称
5. institution 字段必须是**具体院校全称**（如"郑州大学"、"河南大学"）。如果不是具体院校，该条目不得放入 intentions/urgentActions/competitorIntel。
6. source 字段必须包含**具体网站名或 URL**。
7. 当未找到与用户问题完全匹配的招标/中标公告时：
   - 说明"暂未检索到直接匹配的招标/中标公告"；
   - **把笔墨放在 policies 里的政策信号、competitorIntel 里的真实竞品情报、trendAnalysis 里的趋势判断、actionRecommendations 里的可执行建议上**；
   - 禁止在回复开头说"根据现有数据，暂未检索到"或"根据现有资料，暂未找到"。
8. 若 policies、competitorIntel、trendAnalysis、actionRecommendations 中有任何内容，就必须视为"有发现"，不得用"暂未找到"概括。
9. 回复开头的自然语言必须直接总结**发现了什么**和**建议做什么**，不要绕弯子。`,
    outputSchema: BiddingMonitorOutputSchema,
    toolPreferences: ['webSearch', 'searchProjects'],
    maxSteps: 5,
  })
}
