# 现有AI架构文档

> 本文档记录AI-Native重构前，当前系统的AI智能体架构状态。
> 文档时间：2026-06-12
> Git基线：a6f7eb7

---

## 一、架构概览

当前系统采用 **"LLM-native意图理解 + 业务框架注入 + 自主工具调用"** 的AI架构。

核心模块：

```
用户输入（文本/语音）
    ↓
agent-router.ts      —— LLM-native意图理解
    ↓
prompt-builder.ts    —— 注入业务框架 + 方法论 + 工具列表
    ↓
chat.controller.ts   —— 编排LLM调用
    ↓
 tool-registry.ts    —— 注册安全工具
    ↓
 LLM（DeepSeek-V3 via 硅基流动）
    ↓
  ├─ 调用 tools（webSearch/searchCompanies/createTask...）
  └─ 生成结构化回复
    ↓
流式输出到前端
```

---

## 二、AI调用链路（详细）

### Step 1: 请求入口

**文件**: `apps/api/src/agents/chat.controller.ts`

```typescript
POST /api/agent/chat
Body: {
  messages: [{ role, content }],
  sessionId,
  pageContext: { page, entityType?, entityId? }
}
```

处理流程：
1. `ChatRequestSchema.parse()` 校验请求
2. 从 `req.tenantPrisma` 获取租户隔离的Prisma客户端
3. 保存用户消息到 Redis + PostgreSQL
4. 调用 `routeIntent()` 做意图理解

### Step 2: LLM-native意图路由

**文件**: `apps/api/src/agents/core/agent-router.ts`

实现方式：
- 不再使用正则/Fuse.js做硬编码路由
- 使用 `generateText()` 调用LLM
- LLM输出JSON：`{ intent, confidence, entities: { region, product, targetName, scene }, reasoning }`
- 支持14种意图：territory_search, background_research, visit_preparation, visit_analysis 等
- 失败时降级到 general_chat

关键特点：
- 基于完整语义理解，而非关键词匹配
- 自动提取关键实体（地区、产品、目标客户、场景）
- 推理过程透明化

### Step 3: System Prompt构建

**文件**: `apps/api/src/agents/core/prompt-builder.ts`

构建逻辑：
1. 简短角色定义
2. 用户目标上下文（从意图实体提取 region/product/targetName/scene）
3. **业务框架注入**（核心）：
   - territory_search → 区域客户开发工作流（4步）
   - background_research → 客户背景调查工作流（7步）
   - visit_preparation → 拜访准备工作流（6步）
   - visit_analysis → 拜访复盘工作流（5步）
4. 可用工具列表
5. 工作原则（简短）

### Step 4: 工具调用

**文件**: `apps/api/src/agents/core/tool-registry.ts`

工具注册表设计：
- 分类：search/analysis/generation/extraction/check/prediction
- 读写标记：readOnly 默认可用，write 工具需用户明确要求
- 输入/输出 Zod Schema 校验
- 执行上下文包裹：tenantId, userId, role, prisma

当前16个工具：
- searchProjects, getProjectDetail, getProjectHealth
- searchLeads, searchCompanies, searchContacts
- createVisit, createTask, createLead, recordQuickVisit, setReminder
- getBriefing, webSearch, analyzeVisitRecording, searchVisits
- analyzeKbDocument, searchKbDocuments, searchKbSemantic

### Step 5: 专家体系

**目录**: `apps/api/src/agents/experts/`

12个专家智能体：
- territory-search, territory-expansion
- background-research
- visit-prep, visit-analysis
- demand-mining, follow-up
- lead-assessment, team-management
- illusion-detection, sales-coaching, bidding-monitor

每个专家定义：
- intent, label, systemPrompt
- outputSchema（Zod）
- toolPreferences
- maxSteps

### Step 6: LLM多轮调用

**文件**: `apps/api/src/agents/chat.controller.ts` 中的 `nativeFetchWithTools()`

实现方式：
- 绕过AI SDK v6在多步tool calling时的空返回bug
- 使用原生fetch调用 `/chat/completions`
- 支持多轮工具调用循环（最多 maxSteps 轮）
- 工具结果返回给LLM继续推理

### Step 7: 流式输出与持久化

- 模拟流式输出（每20字符分块）或真实 streamText
- 助手回复保存到 Redis + PostgreSQL

---

## 三、数据模型关联

### 对话相关

- `ChatSession`: 会话元数据（tenantId, userId, title, context, messageCount）
- `ChatMessage`: 消息内容（role, content, toolCalls, toolResults, latencyMs, model）

### 业务相关

- `Project`: 商机快照，含 milestone, healthScore, winProbability, evidence, semanticContext
- `Visit`: 拜访记录，含 audioUrl, audioTranscript, aiAnalysis, extractedTasks
- `Company`: 客户/院校
- `Lead`: 线索
- `Contact`: 联系人

### 时序相关

- `TimelineEvent`: 业务时间轴事件，记录Project/Customer的关键变更
- `CustomerSnapshot`: AI生成的周期性客户快照

---

## 四、与文档V4方案的映射

| 文档V4要求 | 当前实现 | 差距 |
|-----------|---------|------|
| DynamicContextAgent（认知中枢） | chat.controller 已实现多轮工具调用，但模式是"问答式" | 需改为"审计式"：提取人·事·财 → 自动投影 → 错漏补救 |
| TimelineEvent为唯一事实源 | TimelineEvent模型已存在，但字段不够丰富 | 需增加 cognitivePayload, mutations, transcriptUrl |
| projectStructuredLedger工具 | 工具注册表已就绪，缺该具体工具 | 需新增 |
| raiseRiskAndPlanNBA工具 | 工具注册表已就绪，缺该具体工具 | 需新增 |
| 证据链（evidenceChain） | Project有evidence字段 | 需增强为绑定TimelineEventID的完整证据链 |
| 生成式卡片UI | AI Copilot侧边栏已实现结构化JSON渲染 | 需从"聊天消息"改为"作战确认卡片" |
| IndexedDB离线缓存 | 无 | 需新增 |
| Prisma RBAC中间件 | 权限散落各controller | 需统一 |

---

## 五、关键代码路径

```
请求入口：      apps/api/src/agents/chat.controller.ts
意图路由：      apps/api/src/agents/core/agent-router.ts
Prompt构建：    apps/api/src/agents/core/prompt-builder.ts
工具注册表：    apps/api/src/agents/core/tool-registry.ts
专家注册：      apps/api/src/agents/experts/registry.ts
专家定义：      apps/api/src/agents/experts/*.ts
工具定义：      apps/api/src/agents/tools/*.ts
记忆管理：      apps/api/src/agents/core/agent-memory.ts
安全护栏：      apps/api/src/agents/core/guardrails.ts
前端Copilot：   apps/web/src/components/layout/ai-copilot.tsx
前端语音表单：   apps/web/src/components/forms/voice-visit-form.tsx
```

---

## 六、重构切入点

基于当前架构，Phase 1重构的核心改造点：

1. **chat.controller.ts**: 从问答模式 → 审计模式
2. **新增两个核心工具**: projectStructuredLedger + raiseRiskAndPlanNBA
3. **TimelineEvent模型增强**: 增加cognitivePayload + mutations + transcriptUrl
4. **Project证据链增强**: 绑定TimelineEventID
5. **前端新增**: VoiceCollector + BattleConfirmCard
6. **离线能力新增**: IndexedDB缓存

---

*文档由AI在重构启动前整理，用于指导后续开发。*
