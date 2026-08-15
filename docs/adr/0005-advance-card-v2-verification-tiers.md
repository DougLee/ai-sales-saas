# ADR-0005: 推进卡 v2——统一材料入口与验证水位

- 状态：已接受
- 日期：2026-08-15
- 背景：设计稿《商机里程碑推进卡重塑 v2 20260815》
- 前置：ADR-0004（门禁=字段有无；本 ADR=字段可信度，两层互补不冲突）

## 决策

### 1. 统一材料提交入口

推进卡顶部唯一提交区（上传录音/文档），对接现有拜访录入管线（VisitForm → rawInput → runVisitAnalysis → 确认队列/auto-apply）。销售动作收敛为「交材料」和「推进」两个。

### 2. 四级验证水位（信任分级）

| 水位 | 含义 | 达成方式 |
|---|---|---|
| 自述·未验证 (manual) | 销售手填 | 阶段档案人工录入 |
| 单源·待确认 (single) | 一份材料 AI 提取 | 拜访分析 auto-apply（对接 V6.2 确认队列，可 revoke） |
| 交叉验证 (cross) | ≥2 独立来源口径一致 | 第二份材料到达，AI 提取到同字段 |
| 坐实 (final) | 决策人确认/正式文件 | decision 级字段的人工确认按钮；manual-pass 豁免映射到此档展示 |

存储：`evidence._gateFieldSource` 升级为 `{ [path]: { level, sources: string[] } }`（兼容旧 string 值：manual/manual-pass）。来源链 chips 可撤销（撤销来源→水位降级）。

### 3. 强/弱锚定推进

- 字段**有值**即可推进（ADR-0004 门禁不变：空值仍拦截）
- 推进时计算水位：全部字段达验证要求 = **强锚定**；有未达标 = **弱锚定**（放行 + 提醒"后续材料到达可补强"）
- 锚定结果存 `evidence._anchors[milestone] = 'strong' | 'weak'`，时间轴 eventData 记 anchorLevel，锚点条显示 ⚓强/⚓弱

### 4. 三段式命名与口语化 gate 文案

- 全局分段命名改为：育单期 M0-2 / 谈单期 M3-5 / 成单期 M6-8（分段不变，仅命名），段形进度条组件化
- 阶段档案字段文案用口语化 label（"怎么认识的/钱从哪来、多少"），正式名保留在 title/帮助文案

### 5. 各 gate 字段的验证要求档位

material（有客观材料即可）：firstContact、bidResult；cross（≥2 来源）：painPoints、requirements、budget；decision（决策人坐实）：solution、price、decisionMap。

## 后果

- visits.analysis 的 auto-apply 扩展：字段已有值且 AI 再次提取到时累积来源（single→cross 升级路径）
- 撤销来源=水位降级，与确认队列 revoke 并存（来源链管信任，revoke 管内容）
- 弱锚定的字段在指标统计中如实计数，"含豁免率/弱锚定率"指标另议
