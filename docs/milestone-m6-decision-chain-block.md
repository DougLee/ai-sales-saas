# 里程碑 M6→M7 推进阻塞问题复盘

> 记录时间：2026-08-13
> 相关页面：`/projects?entityType=project&entityId=...`
> 问题现象：商机详情页点击「推进」时提示「推进条件不满足：决策链人物 尚未录入」，无法从 M6 推进到 M7；同时手动添加决策链人物时报错 `Expected string, received null`。

## 1. 问题现象

### 1.1 里程碑无法推进

某个处于 **M6 协助采购** 阶段的商机显示：

- 里程碑进度：M6
- 阶段推进校验：决策链人物 · **未录入**
- 点击「推进」按钮后报错：`推进条件不满足：决策链人物 尚未录入`

用户已按照 M6→M7 的拜访摘要模板录入拜访记录，明确列出了决策链人物（姓名、职务、态度），但推进条件始终未满足。

### 1.2 手动添加人物报错

在商机详情页的「决策链」板块点击「添加人物」，填写信息后保存，接口返回 400 错误：

```json
[
  { "path": ["nodes", 1, "title"], "message": "Expected string, received null" },
  { "path": ["nodes", 1, "department"], "message": "Expected string, received null" }
]
```

## 2. 根因分析

### 2.1 里程碑门控要求

`packages/shared/src/constants/methodology.ts` 中定义：

```ts
{
  fromStage: 6,
  requiredFields: [
    { path: 'decisionMap.nodes', label: '决策链人物', validator: 'arrayMinLength', params: { min: 1 } },
  ],
},
```

M6→M7 要求 `project.decisionMap.nodes` 数组非空。

### 2.2 实现断层一：决策链提取后不进自动落库

`apps/api/src/crm/visits/visits.analysis.controller.ts` 虽然能提取 `decisionChain`，但提取后创建的是 `status='pending'` 的 `aiPendingItem`，需要用户去「待确认」页面人工确认后才会写入 `project.decisionMap`。

而 M0/M4/M5 修复后，同类字段都已改为**自动生效**（auto applied）。决策链因为被归类为「高风险信息」，仍走待确认队列，导致用户录完拜访后 `decisionMap` 仍然为空。

### 2.3 实现断层二：决策链字段校验过严

`VisitAnalysisSchema` 中 `decisionChain` 的每个节点要求 `name`、`role`、`attitude`、`insight` 全部必填：

```ts
decisionChain: z.array(z.object({
  name: z.string(),
  role: z.string(),
  attitude: z.string(),
  insight: z.string(),
})).optional(),
```

只要 AI 漏写其中一项，整个 `decisionChain` 数组解析失败，变成空数组。

### 2.4 实现断层三：prompt 对决策链提取不够明确

原 prompt 只写了：

```
decisionChain: 决策链洞察（name, role, attitude, insight）
```

没有明确告诉 AI「必须从拜访记录中把所有提到的人物都提取出来」，导致提取不全或格式不对。

### 2.5 实现断层四：空 decisionMap 会阻止重新写入

`applyConfirmedItem` 中决策链落库逻辑：

```ts
if (!project || project.decisionMap) return {}
```

如果项目里已经有一个空的 `decisionMap` 对象（如 `{}` 或 `{ nodes: [] }`），该方法看到 `project.decisionMap` 存在就直接返回，不再写入新的决策链。

### 2.6 手动添加人物报错原因

`apps/api/src/crm/projects/decision-chain.schema.ts` 中：

```ts
title: z.string().optional(),
department: z.string().optional(),
```

`z.string().optional()` 只接受 `string` 或 `undefined`，不接受 `null`。

但前端 `decision-chain-map.tsx` 的 `nodeFromContact` 在从联系人档案带入数据时，直接把 `contact.position` 和 `contact.department` 赋给 `title` 和 `department`。如果数据库里这两个字段是 `null`，就会原样传给后端，触发校验错误。

## 3. 修复方案

### 3.1 让决策链自动生效

**文件**：`apps/api/src/crm/visits/visits.analysis.controller.ts`

- `decisionChain` 提取后，如果项目 `decisionMap.nodes` 为空，直接调用 `createAutoAppliedItem` 自动落库
- 自动落库条件改为判断 `existingDecisionNodes.length === 0`

### 3.2 放宽决策链字段校验

**文件**：`apps/api/src/crm/visits/visits.analysis.controller.ts`

将 `decisionChain` 子字段改为可选：

```ts
decisionChain: z.array(z.object({
  name: z.string(),
  role: z.string().optional(),
  attitude: z.string().optional(),
  insight: z.string().optional(),
})).optional(),
```

### 3.3 优化 prompt

**文件**：`apps/api/src/crm/visits/visits.analysis.controller.ts`

在分析 prompt 中明确要求：

```
decisionChain: 决策链洞察。必须提取拜访记录中提到的所有关键人物，包括：
name（姓名/姓氏+职务，如"王主任"）、
role（职务/角色，如"教务处处长"）、
attitude（对项目态度：支持/中立/反对/未表态/犹豫）、
insight（关键洞察/诉求/顾虑）。不要遗漏任何提到的人物。
```

### 3.4 修复空 decisionMap 不重写问题

**文件**：`apps/api/src/crm/confirmations/confirmations.service.ts`

将决策链落库条件从：

```ts
if (!project || project.decisionMap) return {}
```

改为：

```ts
if (!project) return {}
const existingMap = (project.decisionMap as Record<string, unknown>) || {}
const existingNodes = Array.isArray(existingMap.nodes) ? (existingMap.nodes as unknown[]) : []
if (existingNodes.length > 0) return {}
```

只有 `decisionMap.nodes` 已经有内容时才跳过；空对象/空数组都会重新写入。

### 3.5 新增 decision_chain 自动生效类型

**文件**：`apps/api/src/crm/confirmations/confirmations.service.ts`

- 将 `decision_chain` 加入 `AUTO_APPLY_TYPES`
- 在 `applyConfirmedItem` 中处理 `decision_chain` 落库
- 在 `revokeAutoItem` 中处理决策链撤销逻辑

### 3.6 修复手动添加人物 null 报错

**文件**：`apps/api/src/crm/projects/decision-chain.schema.ts`

将 `title` 和 `department` 改为接受 null：

```ts
title: z.string().nullish(),
department: z.string().nullish(),
```

## 4. 代码变更摘要

| 文件 | 变更 |
|------|------|
| `apps/api/src/crm/visits/visits.analysis.controller.ts` | `decisionChain` 子字段改为 optional；prompt 明确要求提取所有人物；自动落库条件放宽 |
| `apps/api/src/crm/confirmations/confirmations.service.ts` | `decision_chain` 加入 `AUTO_APPLY_TYPES`；修复空 decisionMap 不重写问题；增加撤销逻辑 |
| `apps/api/src/crm/projects/decision-chain.schema.ts` | `title`/`department` 改为 `nullish()`，接受 null 值 |

## 5. 验证方式

### 5.1 通过拜访记录自动提取决策链

1. 重启 API 服务。
2. 进入 M6 商机详情页，点击「记录拜访」。
3. 在拜访摘要中明确写出决策链人物，例如：
   > 本次拜访重点沟通了项目决策链。决策链情况：①王主任，教务处处长，支持，认为项目符合学校信息化规划；②李科长，财务处预算科科长，中立，需要看最终报价；③张副校长，分管信息化副校长，尚未表态，是最终拍板人；④赵老师，计算机学院教师，支持，愿意配合试点。
4. 保存后刷新页面，「决策链人物」应显示为「已录入」。
5. 点击「推进」按钮，即可从 M6 推进到 M7。

### 5.2 手动添加决策链人物

1. 在项目详情页决策链板块点击「添加人物」。
2. 从已有联系人选择，或手动填写姓名。
3. 职位、部门可以为空，也可以填写。
4. 点击保存，不再报 `Expected string, received null` 错误。

## 6. 设计反思

本次问题再次验证了**方法论 gate 与数据写入链路必须保持一致**的原则：

- 如果某个 gate 字段需要用户通过「记录拜访」自动满足，那么 AI 提取产物必须能直接落库，不能只进待确认队列；
- 手动录入入口（决策链地图添加人物）的 schema 必须兼容真实数据中的 null 值；
- AI 提取 schema 对非关键字段（如 insight）不宜设置为 required，否则一次小遗漏会导致整段提取失效。

## 7. 相关文档

- 里程碑推进总览与早期阶段修复：`docs/milestone-m0-firstcontact-block.md`
- 各阶段拜访摘要写法速查表：`docs/milestone-visit-summary-guide.md`
