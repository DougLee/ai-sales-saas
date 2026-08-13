#!/bin/bash
# scripts/ops/backup.sh
# AI 销售管理系统 — 每日自动备份
# 备份内容：PostgreSQL（pg_dump 自定义格式）+ MinIO 数据卷 + uploads 数据卷 + .env
# 保留：默认 7 天，可在下方 BACKUP_RETAIN_DAYS 修改

set -euo pipefail

# ===== 配置 =====
BACKUP_DIR="${BACKUP_DIR:-/opt/ai-sales/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/ai-sales/ai-sales-saas/docker-compose.prod.yml}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"
TS="$(date +%Y%m%d_%H%M%S)"

# 从 .env 读取数据库连接参数（避免硬编码用户名）
if [ -f /opt/ai-sales/.env ]; then
  set -a
  . /opt/ai-sales/.env
  set +a
fi

# 数据库连接参数（兜底默认值）
DB_USER="${POSTGRES_USER:-ai_sales}"
DB_NAME="${POSTGRES_DB:-ai_sales_prod}"

# ===== 准备 =====
mkdir -p "$BACKUP_DIR"

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }

log "=========================================="
log "  AI 销售管理系统 — 自动备份启动 ($TS)"
log "=========================================="

# ===== 1. PostgreSQL 全量备份 =====
log "[1/4] PostgreSQL pg_dump → db_${TS}.dump"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$BACKUP_DIR/db_${TS}.dump"
DB_SIZE=$(du -sh "$BACKUP_DIR/db_${TS}.dump" | awk '{print $1}')
log "      ✓ db_${TS}.dump ($DB_SIZE)"

# ===== 2. MinIO 数据卷备份 =====
log "[2/4] MinIO 数据卷 → minio_${TS}.tar.gz"
docker run --rm \
  -v ai-sales-saas_minio_data:/d:ro \
  -v "$BACKUP_DIR":/b alpine \
  tar czf "/b/minio_${TS}.tar.gz" -C /d .
MINIO_SIZE=$(du -sh "$BACKUP_DIR/minio_${TS}.tar.gz" | awk '{print $1}')
log "      ✓ minio_${TS}.tar.gz ($MINIO_SIZE)"

# ===== 3. uploads 数据卷备份 =====
log "[3/4] uploads 数据卷 → uploads_${TS}.tar.gz"
docker run --rm \
  -v ai-sales-saas_uploads_data:/d:ro \
  -v "$BACKUP_DIR":/b alpine \
  tar czf "/b/uploads_${TS}.tar.gz" -C /d .
UP_SIZE=$(du -sh "$BACKUP_DIR/uploads_${TS}.tar.gz" | awk '{print $1}')
log "      ✓ uploads_${TS}.tar.gz ($UP_SIZE)"

# ===== 4. .env 配置备份 =====
log "[4/4] .env 配置 → env_${TS}"
if [ -f /opt/ai-sales/.env ]; then
  cp /opt/ai-sales/.env "$BACKUP_DIR/env_${TS}"
  chmod 600 "$BACKUP_DIR/env_${TS}"
  log "      ✓ env_${TS} (600 权限)"
else
  log "      ⚠ /opt/ai-sales/.env 不存在，跳过"
fi

# ===== 清理过期备份 =====
log ""
log "清理 ${BACKUP_RETAIN_DAYS} 天前的备份..."
DELETED=$(find "$BACKUP_DIR" -type f -mtime +"$BACKUP_RETAIN_DAYS" -delete -print | wc -l)
log "      ✓ 删除 $DELETED 个过期文件"

# ===== 汇总 =====
log ""
log "本次备份完成："
ls -lh "$BACKUP_DIR"/*_"$TS"* | awk '{print "  "$NF" ("$5")"}'

DISK_USAGE=$(df -h "$BACKUP_DIR" | awk 'NR==2{print $5}')
log "备份目录磁盘使用率: $DISK_USAGE"

log "=========================================="
log "  备份完成 ✅"
log "=========================================="