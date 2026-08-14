# 里程碑 M7→M8 推进阻塞问题复盘

> 记录时间：2026-08-13
> 相关页面：`/projects?entityType=project&entityId=...`
> 问题现象：商机详情页点击「推进」时提示「推进条件不满足：中标结果 尚未录入」，无法从 M7 推进到 M8。

## 1. 问题现象

在 `/projects` 商机详情页中，某个处于 **M7 招标确认** 阶段的商机显示：

- 里程碑进度：M7
- 阶段推进校验：中标结果 · **未录入**
- 点击「推进」按钮后报错：`推进条件不满足：中标结果 尚未录入`

用户已录入包含「中标」「签约」等信息的拜访摘要，但推进条件始终未满足。

## 2. 根因分析

### 2.1 里程碑门控要求

`packages/shared/src/constants/methodology.ts` 中定义：

```ts
{
  fromStage: 7,
  requiredFields: [{ path: 'evidence.bidResult', label: '中标结果' }],
},
```

M7→M8 要求 `project.evidence.bidResult` 字段非空。

### 2.2 AI 拜访分析不提取 evidence.bidResult

`apps/api/src/crm/visits/visits.analysis.controller.ts` 中的 `VisitAnalysisSchema` 原本没有 `evidence` 对象，也没有 `bidResult` 字段。因此无论拜访摘要怎么写，AI 都不会把「中标结果」写入项目档案。

这是和 M0 `firstContact`、M4 `solution`、M5 `price`、M6 `decisionChain` 同类型的 bug：**方法论 gate 要一个字段，AI 提取体系里没这个字段**。

## 3. 修复方案

### 3.1 让 AI 分析提取 evidence.bidResult

**文件**：`apps/api/src/crm/visits/visits.analysis.controller.ts`

- 在 `VisitAnalysisSchema` 中新增 `evidence` 对象：
  ```ts
  evidence: z.object({
    bidResult: z.string().optional(),
  }).optional(),
  ```
- 在分析 prompt 中明确要求提取「中标结果或签约信息，如'已中标，金额128万'或'已签约'」
- 分析完成后，如果提取到 `bidResult` 且 `project.evidence.bidResult` 为空，调用 `createAutoAppliedItem` 自动落库

### 3.2 新增 bid_result 自动生效类型

**文件**：`apps/api/src/crm/confirmations/confirmations.service.ts`

- 将 `bid_result` 加入 `AUTO_APPLY_TYPES`
- 在 `applyConfirmedItem` 中增加 `bid_result` 分支：把内容写入 `project.evidence.bidResult`
- 在 `revokeAutoItem` 中增加撤销逻辑：如果内容匹配则清空 `evidence.bidResult`

### 3.3 正则兜底提取

**文件**：`apps/api/src/crm/visits/visits.analysis.controller.ts`

AI 有时会忽略 schema 要求或把中标信息分散输出。兜底逻辑：如果解析后的 `analysis.evidence.bidResult` 为空，但 `content` 包含「我方/我们/公司 + 中标/签约/合同金额」等表述，用正则提取紧随其后的文本，补填到 `evidence.bidResult`。这样可以覆盖「我方成功中标，中标金额为 128 万元（含税）」这类明确语句。

## 4. 代码变更摘要

| 文件 | 变更 |
|------|------|
| `apps/api/src/crm/visits/visits.analysis.controller.ts` | `VisitAnalysisSchema` 增加 `evidence.bidResult`；prompt 增加提取要求；分析后自动写入 `project.evidence.bidResult`；新增正则兜底提取 |
| `apps/api/src/crm/confirmations/confirmations.service.ts` | 支持 `bid_result` 自动生效、落库、撤销 |

## 5. 验证方式

1. 重启 API 服务。
2. 进入 M7 商机详情页，点击「记录拜访」。
3. 在拜访摘要中明确写出中标或签约结果，例如：
   > 本项目招标结果已公示，我方成功中标，中标金额为 128 万元（含税）。已收到中标通知书，计划本周内签订合同并启动项目交付。
4. 保存后刷新页面，「中标结果」应显示为「已录入」。
5. 点击「推进」按钮，即可从 M7 推进到 M8。

**如果仍显示未录入**：
- 打开该拜访详情，查看是否生成了 `aiPendingItem`（类型 `bid_result`）。
- 检查 `project.evidence.bidResult` 是否有值。
- 若 AI 仍未提取，可手动在摘要开头用更直白句式：「已中标，合同金额 128 万元」。

## 6. 拜访摘要写作模板

```text
本次拜访通报了项目招标/签约进展。

招标结果：
- 项目状态：[已中标 / 已签约 / 中标候选 / 流标等]
- 中标金额：[XXX 万元，含税]
- 合同范围：[简要说明交付内容]
- 下一步：[如签订合同、召开启动会、安排交付等]

客户反馈：
[客户对中标结果的态度，是否有补充要求或顾虑]
```

### 示例

> 本项目招标结果已公示，我方成功中标，中标金额为 128 万元（含税）。中标范围包括校级 AI 通识课平台、课程资源包、教师培训及三年技术支持。已收到中标通知书，客户对中标结果无异议，计划本周内完成合同签订，下月初召开项目启动会。

## 7. 设计反思

本次问题再次说明：**方法论 gate 字段必须与 AI 提取 schema 一一对应**。新增 gate 字段时，必须同步：

1. 在 `VisitAnalysisSchema` 中添加对应字段；
2. 在 prompt 中明确提示 AI 提取；
3. 在 `confirmations.service.ts` 中添加自动落库类型（如果该字段需要自动生效）。

## 8. 相关文档

- 里程碑推进总览与早期阶段修复：`docs/milestone-m0-firstcontact-block.md`
- M6→M7 决策链问题复盘：`docs/milestone-m6-decision-chain-block.md`
- 各阶段拜访摘要写法速查表：`docs/milestone-visit-summary-guide.md`
