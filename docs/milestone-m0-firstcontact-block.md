# 里程碑推进阻塞问题复盘（M0 firstContact / M4 solution / M5 price / M6 decisionChain / M7 bidResult）

> 记录时间：2026-08-13
> 相关页面：`/projects?entityType=project&entityId=...`
> 问题现象：商机详情页点击「推进」时提示门控字段未录入，无法推进里程碑。
>
> 更新：2026-08-13 后续推进到 M4/M5/M6/M7 时均遇到同类问题，已一并修复。

## 1. 问题现象

在 `/projects` 商机详情页中，某个处于 **M0 初识客户** 阶段的商机显示：

- 里程碑进度：M0
- 阶段推进校验：首次接触方式 · **未录入**
- 点击「推进」按钮后报错：`推进条件不满足：首次接触方式 尚未录入`

用户已多次通过「记录拜访」录入拜访摘要，但推进条件始终未满足。

## 2. 根因分析

### 2.1 里程碑门控要求

`packages/shared/src/constants/methodology.ts` 中定义了默认里程碑 gate 规则：

```ts
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
  // ...
]
```

M0→M1 要求 `project.humanInfo.firstContact` 字段非空。

### 2.2 M4 / M5 / M6 / M7 阶段同样存在断层

`DEFAULT_MILESTONE_GATE_RULES` 中：

- M4→M5 要求 `{ path: 'businessInfo.solution', label: '方案要点' }`
- M5→M6 要求 `{ path: 'financeInfo.price', label: '报价金额' }`
- M6→M7 要求 `{ path: 'decisionMap.nodes', label: '决策链人物' }`
- M7→M8 要求 `{ path: 'evidence.bidResult', label: '中标结果' }`

但 `VisitAnalysisSchema` 同样**没有 `solution`、`price`、`evidence` 字段**。AI 原本只提取 `budget`（客户预算），而 M5 gate 校验的是 `price`（我方报价）。决策链虽然能提取，但默认进入待确认队列，不会自动落库。中标结果完全没有提取字段。因此用户在 M4/M5/M6/M7 阶段无法直接通过「记录拜访」推进。修复方式与 M0 一致：缺少的字段补充提取，需要自动生效的改为自动生效；M7 中标结果额外加了正则兜底，防止 AI 漏提。

### 2.3 实现断层一：AI 拜访分析不提取 firstContact / solution

`apps/api/src/crm/visits/visits.analysis.controller.ts` 中的 `VisitAnalysisSchema` 原本只提取：

- `keyInfo.budget`
- `keyInfo.timeline`
- `keyInfo.competitors`
- `keyInfo.painPoints`

**没有 `firstContact` 和 `solution` 字段**。因此无论拜访摘要怎么写，AI 都不会把「首次接触方式」或「方案要点」写入项目档案。

### 2.3 实现断层二：手动录入拜访不触发 AI 分析

`/projects` 详情页的「记录拜访」按钮打开的是 `VisitForm`（手动录入），调用的接口是 `POST /api/visits`，对应 `apps/api/src/crm/visits/visits.controller.ts` 中的 `create` 方法。

该方法原本只做了三件事：

1. 创建拜访记录
2. 初始化拜访闭环
3. 异步触发拜访准备任务

**没有调用 `runVisitAnalysis`**。真正的 AI 分析只在 `logVisit`（语音/录音录入）和 `close` 中触发。

此外，`runVisitAnalysis` 读取分析源时只认 `rawInput` / `audioTranscript`，不认手动表单填写的 `summary`。

### 2.4 结论

用户通过手动表单录入拜访后：

- `summary` 被保存到拜访记录
- 但 `summary` 没被当作 AI 分析输入
- AI 也不提取 `firstContact`
- `project.humanInfo.firstContact` 永远为空
- 所以 M0 永远推不进 M1

## 3. 修复方案

### 3.1 让 AI 分析提取 firstContact、solution、price、decisionChain 和 evidence.bidResult

**文件**：`apps/api/src/crm/visits/visits.analysis.controller.ts`

- 在 `VisitAnalysisSchema` 中新增：
  - `keyInfo.firstContact: z.string().optional()`
  - `keyInfo.solution: z.string().optional()`
  - `keyInfo.price: z.string().optional()`
  - `evidence.bidResult: z.string().optional()`
  - `decisionChain` 子字段改为 optional
- 在分析 prompt 中明确要求提取：
  - 「首次接触方式（电话/拜访/引荐/展会）」
  - 「方案要点」
  - 「我方报价 price（与客户预算 budget 区分）」
  - 「决策链人物（name, role, attitude, insight）」
  - 「中标结果或签约信息」
- 分析完成后，如果提取到字段且项目档案中对应字段为空，调用 `createAutoAppliedItem` 自动落库

### 3.2 新增 first_contact、solution_summary、price_quote、bid_result、decision_chain 自动生效类型

**文件**：`apps/api/src/crm/confirmations/confirmations.service.ts`

- 将 `first_contact`、`solution_summary`、`price_quote`、`bid_result`、`decision_chain` 加入 `AUTO_APPLY_TYPES`
- 在 `applyConfirmedItem` 中增加对应分支：
  - `first_contact` → 写入 `project.humanInfo.firstContact`
  - `solution_summary` → 写入 `project.businessInfo.solution`
  - `price_quote` → 写入 `project.financeInfo.price`
  - `bid_result` → 写入 `project.evidence.bidResult`
  - `decision_chain` → 写入 `project.decisionMap`
- 在 `revokeAutoItem` 中增加撤销逻辑

### 3.3 让手动创建拜访也能触发 AI 分析

**文件**：`apps/api/src/crm/visits/visits.controller.ts`

在 `create` 方法中：

- 如果请求没传 `rawInput` 但传了 `summary`，自动把 `summary` 内容落到 `rawInput`（`rawInputType='note'`）
- 创建完成后，如果存在 `rawInput`，同步调用 `runVisitAnalysis` 进行 AI 提取
- 用 try/catch 包裹，分析失败不阻塞拜访创建

## 4. 代码变更摘要

| 文件 | 变更 |
|------|------|
| `apps/api/src/crm/visits/visits.analysis.controller.ts` | `VisitAnalysisSchema` 增加 `firstContact`、`solution`、`price`、`evidence.bidResult`；`decisionChain` 改为自动生效；prompt 增加提取要求；分析后自动写入对应项目字段 |
| `apps/api/src/crm/confirmations/confirmations.service.ts` | 支持 `first_contact`、`solution_summary`、`price_quote`、`bid_result`、`decision_chain` 自动生效、落库、撤销 |
| `apps/api/src/crm/visits/visits.controller.ts` | `create` 时将 `summary` 回退到 `rawInput`；创建后自动触发 AI 分析 |

## 5. 验证方式

### M0 → M1

1. 重启 API 服务。
2. 进入 M0 商机详情页，点击「记录拜访」。
3. 在拜访摘要中明确写出首次接触方式，例如：
   > 通过电话首次联系到教务处王主任，已建立初步联系。
4. 保存后刷新页面，「首次接触方式」应显示为「已录入」。
5. 点击「推进」按钮，即可从 M0 推进到 M1。

### M4 → M5

1. 进入 M4 商机详情页，点击「记录拜访」。
2. 在拜访摘要中明确写出方案要点，例如：
   > 本次向客户提交了基于 AI 通识课平台的定制化方案，已完成产品演示。方案要点：①校级统一开课平台；②配套 50 学时教师培训；③与教务系统对接；④分三年分期建设。客户总体认可，提出需要补充性价比对比。
3. 保存后刷新页面，「方案要点」应显示为「已录入」。
4. 点击「推进」按钮，即可从 M4 推进到 M5。

### M5 → M6

1. 进入 M5 商机详情页，点击「记录拜访」。
2. 在拜访摘要中明确写出**我方报价金额**，例如：
   > 本次向客户提交了正式报价，总报价为 128 万元（含税），包含平台授权、课程资源、教师培训及三年技术支持。付款方式为合同签订后付 40%，部署验收后付 40%，整体验收后付 20%。
3. 保存后刷新页面，「报价金额」应显示为「已录入」。
4. 点击「推进」按钮，即可从 M5 推进到 M6。

**注意**：AI 会区分 `budget`（客户预算）和 `price`（我方报价）。M5 gate 校验的是 `price`，所以摘要里要突出「我方报价」「总报价」等表达。

### M6 → M7

1. 进入 M6 商机详情页，点击「记录拜访」。
2. 在拜访摘要中明确写出**决策链人物**，例如：
   > 本次拜访重点沟通了项目决策链和后续采购流程。决策链情况：①王主任，教务处处长，支持，认为项目符合学校信息化规划；②李科长，财务处预算科科长，中立，需要看最终报价；③张副校长，分管信息化副校长，尚未表态，是最终拍板人；④赵老师，计算机学院教师，支持，愿意配合试点。
3. 保存后刷新页面，「决策链人物」应显示为「已录入」。
4. 点击「推进」按钮，即可从 M6 推进到 M7。

### M7 → M8

1. 进入 M7 商机详情页，点击「记录拜访」。
2. 在拜访摘要中明确写出**中标或签约结果**，例如：
   > 本项目招标结果已公示，我方成功中标，中标金额为 128 万元（含税）。已收到中标通知书，计划本周内签订合同并启动项目交付。
3. 保存后刷新页面，「中标结果」应显示为「已录入」。
4. 点击「推进」按钮，即可从 M7 推进到 M8。

## 6. 后续各阶段推进摘要写法

| 目标阶段 | Gate 字段 | 拜访摘要中需要明确写出 |
|----------|-----------|------------------------|
| M0 → M1 | `humanInfo.firstContact` | 首次接触方式：电话/拜访/引荐/展会 |
| M1 → M2 | `humanInfo.painPoints` | 具体痛点：师资不足/平台卡顿/管理困难等 |
| M2 → M3 | `businessInfo.requirements` | 需求指标：覆盖学生数、功能要求、时间线 |
| M3 → M4 | `financeInfo.budget` | 预算金额或预算来源 |
| M4 → M5 | `businessInfo.solution` | 方案要点、实施计划、客户反馈 |
| M5 → M6 | `financeInfo.price` | 报价金额 |
| M6 → M7 | `decisionMap.nodes` | 决策链人物、角色、态度 |
| M7 → M8 | `evidence.bidResult` | 中标结果、签约信息 |

## 7. 设计反思

本次问题属于**方法论配置与 AI 提取能力不一致**导致的流程卡死：

- 前端 checklist 只是行为指引，不控制推进；
- 后端 gate 依赖结构化字段；
- AI 提取产物没有覆盖 gate 所需的全部字段；
- 手动录入入口没有接入 AI 分析链路。

后续新增里程碑 gate 字段时，应同步检查：

1. `VisitAnalysisSchema` 是否提取该字段；
2. `confirmations.service.ts` 是否有对应的落库类型；
3. 手动录入、语音录入、AI 助手等多个入口是否都会触发分析。
