# 重构基线记录

## 记录时间
2026-06-12

## 基线说明
此文件记录了AI-Native重构开始前的系统基线状态。

## Git基线
- 提交哈希：10b1b99
- 提交信息：refactor: 智能体架构重构 - LLM-native意图理解 + 业务框架注入 + 自主工具调用
- 分支：main

## 数据库基线
- 数据库：ai_sales_dev
- 备份文件：backups/ai_sales_dev_baseline_20260612_085144.sql
- 备份大小：1.2M
- Prisma迁移状态：Database schema is up to date!
- 迁移文件：
  - 20260604021736_init
  - 20260605230253_make_visit_project_optional

## 系统版本
- 项目版本：v2.3.0
- 主要资产：
  - 20+ Prisma模型
  - Fastify后端 + 20+ API路由
  - React前端 + 13个页面
  - AI智能体架构（16工具 + 12专家）
  - LLM-native意图路由（刚重构）
  - 业务框架注入（刚重构）

## 重构起点
从该基线开始，按 approved plan 执行Phase 1重构：
TimelineEvent事实源 + 语音闭环
