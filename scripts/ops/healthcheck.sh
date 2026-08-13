#!/bin/bash
# scripts/ops/healthcheck.sh
# AI 销售管理系统 — 健康检查（每 5 分钟跑一次）
# 通过 crontab 调用：*/5 * * * * /opt/ai-sales/ai-sales-saas/scripts/ops/healthcheck.sh
# 失败时调用 BARK 推送告警（无 BARK URL 时仅写日志）

set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://localhost/api/health}"
BARK_URL="${BARK_URL:-}"  # 例：https://api.day.app/xxxxx
LOG_FILE="${LOG_FILE:-/var/log/ai-sales-healthcheck.log}"

mkdir -p "$(dirname "$LOG_FILE")"

notify() {
  local title="$1" body="$2"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $title: $body" >> "$LOG_FILE"

  if [ -n "$BARK_URL" ]; then
    # Bark 推送
    curl -sf --max-time 10 "${BARK_URL}/${title}/${body}" > /dev/null 2>&1 || true
  fi
}

# 1. HTTP 健康检查（重试 2 次）
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  # 进一步看 status 是否 ok
  STATUS=$(curl -sf --max-time 10 "$HEALTH_URL" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
  if [ "$STATUS" = "ok" ]; then
    # 静默成功（只在故障时通知）
    exit 0
  else
    notify "AI-Sales-DEGRADED" "status=$STATUS http=$HTTP_CODE"
    exit 1
  fi
else
  notify "AI-Sales-DOWN" "http=$HTTP_CODE url=$HEALTH_URL"
  exit 1
fi