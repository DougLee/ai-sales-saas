# 环境变量配置指南

本文档说明 AI 销售管理系统各环境的 `.env` 文件使用方式。

## 文件说明

| 文件 | 用途 | 是否入版本库 |
|------|------|--------------|
| `.env.example` | 本地开发环境完整模板 | ✅ |
| `.env.template` | 生产环境模板 | ✅ |
| `.env.staging` | 预发布/Staging 环境模板 | ✅ |
| `.env` | 实际运行配置（由上述模板复制生成） | ❌ |
| `.env.local` | 本地覆盖（可选） | ❌ |

## 快速开始

### 本地开发

```bash
cp .env.example .env
# 修改 .env 中的数据库、Redis、AI Key 等配置
pnpm --filter @ai-sales/api dev
```

### 生产部署

```bash
cp .env.template .env
# 填入真实的 JWT_SECRET、DATABASE_URL、OPENAI_API_KEY、MinIO 密钥等
# 确认 .env 已加入 .gitignore
pnpm --filter @ai-sales/api db:generate
docker compose -f docker-compose.prod.yml up -d
```

## 敏感配置清单

以下配置**严禁**写入镜像或提交到 Git：

- `JWT_SECRET`：用于签名用户 token
- `OPENAI_API_KEY` / `EMBEDDING_API_KEY`：大模型 API 密钥
- `SENSEVOICE_API_KEY`：语音转写 API 密钥
- `BING_SEARCH_API_KEY` / `TAVILY_API_KEY`：搜索 API 密钥
- `DATABASE_URL`：包含数据库密码
- `MINIO_SECRET_KEY` / `POSTGRES_PASSWORD`：基础设施密码

生产环境应通过以下方式注入：

1. 服务器上的 `.env` 文件（600 权限）
2. Docker Secrets / Kubernetes Secrets
3. 云厂商密钥管理服务（如 AWS Secrets Manager、阿里云 KMS）

## 环境分层

### 开发环境（development）

- 数据库：`ai_sales_dev`
- Redis：本地 `localhost:6379`
- MinIO：本地 `localhost:9000`
- 日志：打印 query / warn / error
- AI 模型：可使用本地服务或第三方测试 key

### 预发布环境（staging）

- 与生产同构，但使用独立数据库
- 建议使用成本较低的模型或 rate limit
- 用于上线前验证

### 生产环境（production）

- 强 JWT_SECRET、独立数据库凭据
- 使用正式的第三方 AI API key
- 启用限流、健康检查、日志 JSON 化
- 敏感配置通过 Secret 注入，不进入镜像

## Docker 镜像安全

`apps/api/Dockerfile` 已通过多阶段构建将源码与构建产物分离，但**不会**把 `.env` 复制到镜像中。运行时通过 `docker-compose.prod.yml` 的 `environment` 或挂载 `.env` 注入配置。

## 验证

启动后访问健康检查接口确认依赖连通：

```bash
curl http://localhost:3000/health
```

预期返回（`version` 自动读取 `package.json`）：

```json
{
  "status": "ok",
  "version": "2.3.0",
  "checks": {
    "database": { "ok": true, "latencyMs": 5 },
    "redis": { "ok": true, "latencyMs": 2 }
  }
}
```

## 可观测性配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LOG_LEVEL` | `info` | 日志级别：`trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `SERVICE_NAME` | `ai-sales-api` | 服务标识，会附加到每条日志 |
| `SERVICE_VERSION` | - | 服务版本号；留空时自动从 `package.json` 读取 |

生产环境（`NODE_ENV=production`）下，Pino 默认输出 JSON 格式，可直接由日志采集器抓取。关键错误（如 `AI_SERVICE_ERROR`、`DATABASE_ERROR`、`INTERNAL_ERROR`）会在日志中附加 `alertable: true` 和 `severity: critical`，便于配置告警规则。

开发环境（`NODE_ENV=development`）下，日志通过 `pino-pretty` 彩色输出，便于本地调试。
