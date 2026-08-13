# 前端资产梳理文档

> 本文档梳理AI-Native重构前，前端代码的可复用性、需改造点和需新建点。
> 文档时间：2026-06-12
> Git基线：a6f7eb7

---

## 一、前端代码规模

- 位置：`apps/web/src/`
- 总文件数：57个 TS/TSX 文件
- 总代码行数：约 11,175 行
- 核心复杂组件：
  - `ai-copilot.tsx`：611行
  - `voice-visit-form.tsx`：621行
  - `structured-output.tsx`：849行

---

## 二、复用级别分类

### A. 可直接复用（改动 < 20%）

| 文件/模块 | 复用理由 | 预计改动 |
|----------|---------|---------|
| `App.tsx` | 整体布局框架通用（Sidebar+TopBar+Main+Aside） | 仅调整路由映射 |
| `lib/api.ts` | JWT认证、401跳转、错误解析通用 | 无 |
| `lib/toast.ts` | 轻量通知系统，无业务耦合 | 无 |
| `lib/markdown.tsx` | 自定义Markdown渲染器 | 无 |
| `components/ui/*.tsx` | 基础UI组件（modal/drawer/toaster） | 无 |
| `components/chat/structured-output.tsx` 中基础组件 | JsonObject/JsonValue/ScoreBar/Badge/CollapsibleSection | 无 |
| `hooks/use-copilot.ts` | Hook结构、会话CRUD、localStorage持久化 | API路径/pageMap调整 |
| `components/layout/ai-copilot.tsx` UI框架 | 侧边栏布局、消息气泡、拖拽调整、会话切换 | Action类型/QUICK_PROMPTS调整 |
| 主题系统（use-theme.ts + index.css） | 明暗模式+Tailwind变量已就绪 | 无 |

### B. 需要增强改造（改动 20% - 60%）

| 文件/模块 | 需改造内容 | 改造后用途 |
|----------|-----------|-----------|
| `components/layout/ai-copilot.tsx` | 1. Action执行逻辑（API路径/字段）<br>2. QUICK_PROMPTS页面上下文<br>3. 从聊天消息改为作战确认卡片<br>4. 调用DynamicContextAgent而非旧chat API | AI-Native交互主入口 |
| `components/forms/voice-visit-form.tsx` | 1. 简化三阶段流程<br>2. 改为单按钮录音UI<br>3. 整合IndexedDB离线缓存<br>4. 调用新API `/api/agent/audit`<br>5. 调整数据模型字段 | VoiceCollector组件基础 |
| `components/chat/structured-output.tsx` | 1. 保留通用渲染器<br>2. 重写Intent-specific Renderer<br>3. 更新LABEL_MAP字段映射 | 作战确认卡片渲染 |
| `hooks/use-copilot.ts` | 1. pageMap路由映射<br>2. API端点路径<br>3. 流协议可能需要调整 | AI-Native对话Hook |
| `routes/dashboard.tsx` | 从简报卡片转向"今日作战任务+确认卡片" | 新首页 |
| `routes/visits.tsx` | 保留列表但增加VoiceCollector入口 | 拜访中心 |

### C. 需要完全新建（改动 > 60%）

| 文件/模块 | 新建理由 | 功能 |
|----------|---------|------|
| `hooks/use-indexeddb.ts` | 当前系统无IndexedDB相关代码 | 离线缓存音频/待同步队列 |
| `components/voice/VoiceCollector.tsx` | 文档要求的零表单语音输入核心组件 | 单按钮录音+离线缓存+自动同步 |
| `components/battle/BattleConfirmCard.tsx` | 新范式：作战确认卡片 | 显示AI审计结果+进度影响+建议动作+确认/修改 |
| `components/battle/MutationPreview.tsx` | 新范式：状态变更预览 | 显示本次事件将导致的Project字段变更 |
| `components/battle/NBACard.tsx` | 新范式：错漏补救卡片 | 显示缺失维度+风险+补救话术 |
| `routes/battle.tsx` | 新页面：作战中心 | 聚合今日待确认事件+待执行任务 |

---

## 三、外部依赖评估

| 库名 | 用途 | 重构中是否保留 |
|------|------|---------------|
| React 19 | 核心框架 | ✅ 保留 |
| react-router-dom v7 | 路由 | ✅ 保留 |
| @ai-sdk/react | AI聊天流式 | ⚠️ 可能需要降级为原生fetch/SSE，因新交互是卡片确认而非聊天 |
| @tanstack/react-query | 数据获取/缓存 | ✅ 保留 |
| Tailwind CSS | 样式 | ✅ 保留 |
| lucide-react | 图标 | ✅ 保留 |
| zustand | 状态管理 | ✅ 保留（当前未使用，但IndexedDB状态可能用到） |

---

## 四、关键风险点

1. **@ai-sdk/react 适用性**：当前使用v1的`useChat`绑定聊天流。新范式是卡片确认，可能需要更灵活的原生fetch+SSE。
2. **Tailwind自定义类名**：大量类名如`text-text-primary`、`bg-surface-elevated`需要确保在新组件中一致使用。
3. **流式协议差异**：旧AI聊天用`streamProtocol: 'text'`，新审计流可能需要SSE或自定义JSON流格式。
4. **浏览器语音识别限制**：`webkitSpeechRecognition`仅Chrome/Edge，且需HTTPS。

---

## 五、复用率估算

- **可直接复用**：约 40%
- **需要改造**：约 35%
- **需要新建**：约 25%

**结论**：前端不需要推倒重来。重点是：
1. 保留现有UI框架和基础工具
2. 将`ai-copilot`从聊天问答改为卡片确认
3. 将`voice-visit-form`升级为VoiceCollector
4. 新增离线缓存和作战确认卡片

---

*文档由AI在重构启动前整理。*
