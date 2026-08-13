#!/bin/bash
# scripts/ops/disk-check.sh
# AI 销售管理系统 — 磁盘水位监控（每天 08:00 跑）
# crontab: 0 8 * * * /opt/ai-sales/ai-sales-saas/scripts/ops/disk-check.sh
# 阈值 80% 触发告警，95% 二次告警

set -euo pipefail

BARK_URL="${BARK_URL:-}"  # 例：https://api.day.app/xxxxx
THRESHOLD_WARN=80
THRESHOLD_CRIT=95
LOG_FILE="${LOG_FILE:-/var/log/ai-sales-disk.log}"

mkdir -p "$(dirname "$LOG_FILE")"

notify() {
  local title="$1" body="$2"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $title: $body" >> "$LOG_FILE"
  if [ -n "$BARK_URL" ]; then
    curl -sf --max-time 10 "${BARK_URL}/${title}/${body}" > /dev/null 2>&1 || true
  fi
}

# 监控关键挂载点
for MOUNT in / /data /opt/ai-sales; do
  if [ -d "$MOUNT" ]; then
    USAGE=$(df "$MOUNT" | awk 'NR==2{gsub("%",""); print $5}')
    if [ "$USAGE" -ge "$THRESHOLD_CRIT" ]; then
      notify "Disk-CRITICAL" "${MOUNT}=${USAGE}%"
    elif [ "$USAGE" -ge "$THRESHOLD_WARN" ]; then
      notify "Disk-WARN" "${MOUNT}=${USAGE}%"
    fi
  fi
done

# 同时检查 docker 镜像/卷磁盘占用（如果超出 20GB 告警）
DOCKER_SIZE=$(docker system df --format '{{.Type}} {{.Size}}' 2>/dev/null | awk '/Images/{print $2; exit}')
if [ -n "$DOCKER_SIZE" ]; then
  SIZE_NUM=$(echo "$DOCKER_SIZE" | grep -oE '[0-9.]+' | head -1)
  UNIT=$(echo "$DOCKER_SIZE" | grep -oE '[A-Za-z]+' | head -1)
  if [ "$UNIT" = "GB" ] && [ "${SIZE_NUM%.*}" -ge 20 ] 2>/dev/null; then
    notify "Docker-Images-Large" "$DOCKER_SIZE"
  fi
fi

# 静默成功
exit 0