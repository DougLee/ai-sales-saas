#!/bin/bash
# scripts/ops/restore.sh
# AI 销售管理系统 — 备份恢复脚本
# 用法：
#   ./restore.sh list                                     # 列出所有可用备份
#   ./restore.sh restore <timestamp>                      # 恢复指定时间戳的所有内容
#   ./restore.sh db <dump_file>                           # 仅恢复 DB
#   ./restore.sh minio <tar_gz>                           # 仅恢复 MinIO
#   ./restore.sh uploads <tar_gz>                         # 仅恢复 uploads

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/ai-sales/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/ai-sales/ai-sales-saas/docker-compose.prod.yml}"
DB_USER="${POSTGRES_USER:-aisales}"
DB_NAME="${POSTGRES_DB:-aisales}"

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "❌ $*"; exit 1; }

case "${1:-help}" in
  list)
    log "备份目录内容 ($BACKUP_DIR):"
    ls -lh "$BACKUP_DIR" 2>/dev/null || die "备份目录不存在"
    echo ""
    log "可用时间戳:"
    ls "$BACKUP_DIR"/db_*.dump 2>/dev/null | sed 's|.*/db_||;s|\.dump$||' | sort -u
    ;;

  restore)
    TS="${2:?需要时间戳参数，例如 20260619_030000}"
    log "=========================================="
    log "  恢复备份时间戳: $TS"
    log "=========================================="

    # 1. DB 恢复
    if [ -f "$BACKUP_DIR/db_${TS}.dump" ]; then
      log "[1/3] 恢复 PostgreSQL..."
      # 先停 api（避免连接）
      docker compose -f "$COMPOSE_FILE" stop api web 2>&1 | sed 's/^/  /'
      # 重建 DB
      docker compose -f "$COMPOSE_FILE" exec -T postgres \
        dropdb -U "$DB_USER" --if-exists "$DB_NAME"
      docker compose -f "$COMPOSE_FILE" exec -T postgres \
        createdb -U "$DB_USER" "$DB_NAME"
      # 恢复
      cat "$BACKUP_DIR/db_${TS}.dump" | \
        docker compose -f "$COMPOSE_FILE" exec -T postgres \
          pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges
      log "      ✓ DB 恢复完成"
    else
      log "⚠ db_${TS}.dump 不存在，跳过 DB 恢复"
    fi

    # 2. MinIO 恢复
    if [ -f "$BACKUP_DIR/minio_${TS}.tar.gz" ]; then
      log "[2/3] 恢复 MinIO..."
      docker compose -f "$COMPOSE_FILE" stop minio
      docker run --rm \
        -v ai-sales-saas_minio_data:/d \
        -v "$BACKUP_DIR":/b alpine \
        sh -c "rm -rf /d/* && tar xzf /b/minio_${TS}.tar.gz -C /d/"
      docker compose -f "$COMPOSE_FILE" start minio
      log "      ✓ MinIO 恢复完成"
    else
      log "⚠ minio_${TS}.tar.gz 不存在，跳过"
    fi

    # 3. uploads 恢复
    if [ -f "$BACKUP_DIR/uploads_${TS}.tar.gz" ]; then
      log "[3/3] 恢复 uploads..."
      docker compose -f "$COMPOSE_FILE" stop api
      docker run --rm \
        -v ai-sales-saas_uploads_data:/d \
        -v "$BACKUP_DIR":/b alpine \
        sh -c "rm -rf /d/* && tar xzf /b/uploads_${TS}.tar.gz -C /d/"
      log "      ✓ uploads 恢复完成"
    else
      log "⚠ uploads_${TS}.tar.gz 不存在，跳过"
    fi

    # 启回服务
    log "启回所有服务..."
    docker compose -f "$COMPOSE_FILE" up -d
    log "=========================================="
    log "  恢复完成 ✅"
    log "=========================================="
    ;;

  db)
    [ -z "${2:-}" ] && die "用法: restore.sh db <dump_file>"
    DUMP="$2"
    [ -f "$DUMP" ] || die "文件不存在: $DUMP"
    log "恢复 DB: $DUMP"
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
      dropdb -U "$DB_USER" --if-exists "$DB_NAME"
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
      createdb -U "$DB_USER" "$DB_NAME"
    cat "$DUMP" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
      pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges
    log "✅ DB 恢复完成"
    ;;

  minio)
    [ -z "${2:-}" ] && die "用法: restore.sh minio <tar_gz>"
    TGZ="$2"
    [ -f "$TGZ" ] || die "文件不存在: $TGZ"
    log "恢复 MinIO: $TGZ"
    docker compose -f "$COMPOSE_FILE" stop minio
    docker run --rm \
      -v ai-sales-saas_minio_data:/d \
      -v "$(dirname "$TGZ")":/b alpine \
      sh -c "rm -rf /d/* && tar xzf /b/$(basename "$TGZ") -C /d/"
    docker compose -f "$COMPOSE_FILE" start minio
    log "✅ MinIO 恢复完成"
    ;;

  uploads)
    [ -z "${2:-}" ] && die "用法: restore.sh uploads <tar_gz>"
    TGZ="$2"
    [ -f "$TGZ" ] || die "文件不存在: $TGZ"
    log "恢复 uploads: $TGZ"
    docker compose -f "$COMPOSE_FILE" stop api
    docker run --rm \
      -v ai-sales-saas_uploads_data:/d \
      -v "$(dirname "$TGZ")":/b alpine \
      sh -c "rm -rf /d/* && tar xzf /b/$(basename "$TGZ") -C /d/"
    docker compose -f "$COMPOSE_FILE" start api
    log "✅ uploads 恢复完成"
    ;;

  help|*)
    cat <<EOF
AI 销售管理系统 — 备份恢复脚本

用法:
  $(basename "$0") list                              列出所有备份
  $(basename "$0") restore <timestamp>                恢复完整备份（DB+MinIO+uploads）
  $(basename "$0") db <dump_file>                    仅恢复数据库
  $(basename "$0") minio <tar_gz>                    仅恢复 MinIO 数据
  $(basename "$0") uploads <tar_gz>                  仅恢复 uploads

时间戳示例: 20260619_030000（来自 db_20260619_030000.dump 的前缀）
EOF
    ;;
esac