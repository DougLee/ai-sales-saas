# Code Review 检查单 — 智能体数据写入治理

> 依据：《智能体数据写入治理规范.md》
> 生效：2026-08-08（V6.1 Phase 1 起）
> 用法：每次 code review / 提交前逐条对照。**铁律项违反 = 一票否决**。

## 铁律项（一票否决）

- [ ] **核心表无直调**：`companies / contacts / projects / visits / tasks / timelineEvent` 的 create/update 全部经由 `src/lib/entity-services/` 或对应模块服务（closure.service / timeline.ts），无业务代码直调 `prisma.<核心表>.create/update`
- [ ] **AI 事实性产物必带确认态**：智能体提取的任务/需求/预算信号/竞品动向，写入时 `factStatus='pending_confirmation'`（时间轴）或先入 `AiPendingItem`（业务实体），无例外
- [ ] **多租户字段齐全**：任何新表/新查询带 `tenantId`；跨租户数据访问不可能发生

## 强制项

- [ ] 校验规则只定义一次（contracts / entity-services 的 Zod Schema），表单与智能体共用
- [ ] 枚举与阈值读配置表（ProjectTypeConfig 等），无硬编码天数/分数
- [ ] 多实体写入包裹在事务中
- [ ] AI 提取字段携带 evidence 锚定（引用 rawInput 原文片段），无 evidence 的字段在入库前丢弃
- [ ] 评分相关代码不读取 `visits.summary` 作为计分依据（只认 `rawInput` 回退链）
- [ ] behaviorLog 闭环积分只经 `refreshClosure` 的 upsert 写入

## 建议项

- [ ] 新智能体工作流结束时检查：是否有应写入时间轴而未写入的产出？
- [ ] 新 LLM prompt 是否要求"只输出 JSON"+ evidence 引用？

## 附：当前服务层清单

| 实体 | 服务 | 文件 |
|------|------|------|
| 时间轴事件 | recordTimelineEvent / getTimeline / getEventsSince | `src/lib/timeline.ts` |
| 拜访闭环 | refreshClosure / getLastEffectiveFollowUp | `src/crm/visits/closure.service.ts` |
| 任务 | createTask | `src/lib/entity-services/task.service.ts` |
| 联系人 | findOrCreateContact / findSimilarContacts | `src/lib/entity-services/contact.service.ts` |
| （待补）客户/商机/拜访 | Phase 3-4 逐步收口 | — |
