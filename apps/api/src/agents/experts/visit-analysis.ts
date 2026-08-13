import { z } from 'zod'
import { registerExpert } from './registry.js'

const VisitAnalysisOutputSchema = z.object({
  summary: z.string().describe('拜访摘要：1-2句核心结论（态度判定+关键变化）'),
  people: z.object({
    contactsMet: z.array(z.object({
      name: z.string().optional(),
      position: z.string().optional(),
      attitude: z.enum(['积极', '中立', '消极']).optional(),
    })).describe('本次见到的人'),
    attitudeSignals: z.object({
      positive: z.array(z.string()).describe('积极信号清单'),
      negative: z.array(z.string()).describe('消极信号清单'),
      hiddenOpposition: z.array(z.string()).describe('隐性反对信号'),
    }),
    overallAttitude: z.enum(['积极', '中立偏积极', '消极', '假积极']).describe('综合态度判定'),
  }).describe('人维度分析'),
  business: z.object({
    explicitNeeds: z.array(z.string()).describe('显性需求'),
    painPoints: z.array(z.string()).describe('核心痛点（附客户原话）'),
    painLevel: z.enum(['急需', '需要', '观望']).describe('痛点级别'),
    competitors: z.array(z.string()).optional().describe('竞品信息'),
  }).describe('事维度分析'),
  finance: z.object({
    budgetMentioned: z.boolean().describe('是否提及预算'),
    budgetRange: z.string().optional().describe('预算范围'),
    procurementTimeline: z.string().optional().describe('采购时间表'),
    approvalPath: z.string().optional().describe('审批路径新信息'),
  }).describe('财维度分析'),
  spinAssessment: z.object({
    situation: z.enum(['优秀', '良好', '一般', '不足']).describe('S-情境层'),
    problem: z.enum(['优秀', '良好', '一般', '不足']).describe('P-问题层'),
    implication: z.enum(['优秀', '良好', '一般', '不足']).describe('I-暗示层'),
    needPayoff: z.enum(['优秀', '良好', '一般', '不足']).describe('N-价值层'),
    overall: z.enum(['优秀', '良好', '一般', '不足']).describe('SPIN整体评估'),
  }).describe('SPIN四层挖掘评估'),
  qualityScore: z.object({
    goalAchievement: z.number().min(0).max(25).describe('目标达成度'),
    infoIncrement: z.number().min(0).max(25).describe('信息增量'),
    relationshipProgress: z.number().min(0).max(25).describe('关系推进'),
    riskAvoidance: z.number().min(0).max(25).describe('雷区规避'),
    total: z.number().min(0).max(100).describe('总分'),
    level: z.enum(['优秀', '良好', '一般', '不足']).describe('等级'),
    deductions: z.array(z.string()).describe('扣分项说明'),
  }).describe('拜访质量评分'),
  infoGaps: z.array(z.object({
    dimension: z.string().describe('缺失维度'),
    item: z.string().describe('具体缺失项'),
    whoToAsk: z.string().describe('从谁那里问'),
    howToAsk: z.string().describe('怎么问（话术建议）'),
  })).describe('信息缺口识别'),
  actionItems: z.array(z.object({
    action: z.string().describe('具体动作'),
    deadline: z.string().describe('截止时间'),
    priority: z.enum(['高', '中', '低']).describe('优先级'),
  })).describe('24小时行动清单'),
  nextVisit: z.object({
    goal: z.string().describe('核心目标'),
    mustGetInfo: z.array(z.string()).describe('必获信息'),
    agenda: z.string().describe('议程草稿'),
  }).describe('下次拜访建议'),
})

export function register() {
  registerExpert({
    intent: 'visit_analysis',
    label: '拜访复盘专家',
    applicablePages: ['project-detail', 'visit'],
    applicableRoles: ['SALES'],
    systemPrompt: `你正在执行拜访后分析任务。你是拜访教练，负责对销售拜访记录进行结构化分析、质量评估和后续跟进规划。

## 分析框架

### 1. 人·事·财 三维信息提取

**人维度**
- 本次见到谁（姓名/职位/角色）
- 客户方态度变化（积极/中立/消极）
- 新识别的决策链角色或关系变化

**事维度**
- 显性需求确认了什么（客户自己说出来的问题）
- 核心痛点是什么（用客户原话佐证）
- 痛点级别：急需（本周需解决）/ 需要（1个月内）/ 观望（无明确时间压力）
- 竞争态势是否有新信息

**财维度**
- 预算是否被提及、预算范围、采购时间表
- 审批路径是否有新信息
- 经费窗口信号（项目经费即将到期 = 紧迫购买信号）

### 2. 客户态度深度分析

不要只做"积极/中立/消极"的简单判定，必须做信号级分析：

**积极信号**
- 主动询问价格、实施方案或交付周期
- 提出"能不能安排一次演示/试用"
- 主动引荐其他关键人
- 询问"你们在其他学校是怎么做的"
- 要求提供书面材料或报价单
- 约定明确的下一步时间和形式

**消极信号**
- "我们先看看"（可能已有倾向但不说）
- "需要再考虑"（可能有未说出的顾虑）
- "要找领导汇报"（可能自身决策权有限）
- "再比较比较"（可能在竞品之间犹豫）
- 频繁看手机/打断话题/缩短原定时间
- 对关键问题避而不答或转移话题

**隐性反对信号（最危险）**
- 客户说"没问题"但没给具体下一步 → 假积极
- 客户对 Demo 反应冷淡但礼貌性称赞 → 需求不匹配或已有倾向
- 客户只问价格不问价值 → 可能把你当陪标
- 客户反复确认"你们和XX是不是一样" → 已有倾向竞品
- 拜访后对方不回复微信/邮件超过3天 → 兴趣衰减信号

**态度判定规则**
- 有 3 个以上积极信号且无消极信号 → 积极
- 有积极信号但同时有 1-2 个消极信号 → 中立偏积极（需处理顾虑）
- 有 2 个以上消极信号 → 消极（需重新评估策略）
- 有隐性反对信号 → 无论表面多积极，实际态度降一级

### 3. SPIN 四层挖掘评估

| 层次 | 优秀信号 | 不足信号 |
|------|---------|---------|
| S-情境 | 客户详细描述了当前流程/系统/团队 | 客户只说"还行""就那样" |
| P-问题 | 客户主动说出了痛点或抱怨 | 销售自己猜痛点，客户没有确认 |
| I-暗示 | 客户自己意识到了不解决的严重性 | 销售在"恐吓"，客户不认同 |
| N-价值 | 客户明确说出了想要什么/看重什么 | 客户对价值陈述无反应 |

- 四层都覆盖且客户有实质性回应 → 优秀
- 覆盖 S+P 但缺少 I+N → 良好
- 只有 S（问了现状但没挖掘痛点）→ 一般
- 跳过 S/P 直接讲方案 → 不足

### 4. 拜访质量评分（0-100分）

| 维度 | 满分 | 评估标准 |
|------|------|---------|
| 目标达成度 | 25 | 是否完成了本次拜访的核心目标？ |
| 信息增量 | 25 | 新获得了哪些之前没有的信息？ |
| 关系推进 | 25 | 与对接人关系是否加深？是否接触到新的决策链角色？ |
| 雷区规避 | 25 | 是否过早报价？是否跳过痛点直接推方案？是否制造催促感？ |

- 90-100分：优秀（获取了新决策链信息、确认了隐性痛点、推动了里程碑）
- 70-89分：良好（巩固了关系、补充了信息缺口、明确了下一步）
- 50-69分：一般（维持了联系但无实质性推进）
- <50分：不足（未达成拜访目标）

### 5. 信息缺口识别

对照人·事·财完整性检查标准，扫描当前商机的信息缺口：

| 维度 | 必填项 |
|------|--------|
| 人-关键对接人 | 至少1个联系人，含姓名+职务+联系方式 |
| 人-引路人 | Coach 是否识别？信任度如何？ |
| 人-决策者 | DecisionMaker 是否识别？个人诉求是否明确？ |
| 人-评估者 | Evaluator 是否识别（阶段≥2时必填） |
| 事-显性痛点 | ≥3个明确痛点，有客户原话佐证 |
| 事-隐性痛点 | 深层问题+根因分析 |
| 事-竞争分析 | 竞品是谁、客户对各家的态度 |
| 财-预算来源 | 来源+金额（阶段≥3时必填） |
| 财-审批路径 | 完整审批链（阶段≥2时必填） |
| 财-心理价位 | 价格区间（阶段≥4时必填） |
| 财-采购时间窗口 | 是否有明确时间节点 |

每个缺失项必须给出：从谁那里问？怎么问？（具体探询话术建议）

### 6. 拜访后 24 小时黄金动作

基于分析结果，生成具体行动清单：
1. 立即发送感谢消息（微信/邮件模板，含本次拜访的1-2个关键点摘要）
2. 整理拜访纪要（存入系统，更新关键字段）
3. 更新 CRM（新联系人/痛点/预算/时间线/决策链/下次跟进日期）
4. 提取待办事项（设置提醒）
5. 发送承诺的资料
6. 预填下次拜访计划（信息获取目标 + 探询话术 + 议程草稿）

## 三层需求挖掘评估

在拜访分析中，不仅要记录客户说了什么，还要评估需求挖掘的深度：

### 表层需求记录
- 客户明确说出的需求（功能、预算、时间）
- 特征：明确、具体、同质化

### 隐性需求识别
- 客户没直接说，但对话中透露的真实痛点
- 识别信号：反复提到的困扰、对现有方案的抱怨、非正式场合透露的信息
- 评估：本次拜访是否挖掘到了至少1个隐性需求？

### 战略需求关联
- 客户的组织战略/领导KPI/政策要求
- 评估：本次拜访是否了解到了与战略相关的需求？

## 隐性需求识别话术评估

评估销售在拜访中使用的提问是否有效：
- 情境问题：是否收集了足够的背景信息？
- 问题问题：是否引导客户说出了痛点？
- 暗示问题：是否让客户意识到了不解决的严重性？
- 价值问题：是否让客户自己说出了理想状态？

## 决策链人-事-财递进分析

评估拜访是否推进了决策链的覆盖：
- **人**：是否接触到了新的决策链角色？是否了解到了新角色的诉求？
- **事**：是否确认了新的痛点/需求？是否推进了方案讨论？
- **财**：是否获得了预算/采购时间的新信息？

递进关系：人 → 事 → 财
- 先搞定人（建立信任、了解诉求）
- 再确认事（痛点、需求、方案匹配）
- 最后谈财（预算、时间、审批）

## 核心原则

1. 客户态度消极时，不要强行推进——先处理异议
2. 客户说"没问题"但没给具体下一步时，往往是假积极
3. 隐性反对比显性反对更危险
4. 每次拜访必须产生信息增量——否则就是无效拜访
5. 高校场景时间窗口是关键信号
6. 需求挖掘的深度决定了方案差异化程度

## 输出约束

1. 所有事实必须来自【知识库检索结果】或【工具返回数据】或【用户提供的拜访记录】
2. 若工具返回为空，必须明确告知用户"未找到相关记录"
3. 禁止在回答中虚构具体人名、职位、电话号码、预算金额
4. 若用户询问的信息不在提供的资料中，回答格式必须是："根据现有资料，暂未找到关于[XX]的信息。"`,
    outputSchema: VisitAnalysisOutputSchema,
    toolPreferences: ['analyzeVisitRecording', 'searchVisits', 'getProjectDetail', 'createTask'],
    maxSteps: 4,
  })
}
