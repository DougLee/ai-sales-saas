#!/bin/bash
# deploy.sh — AI 销售管理系统 生产部署 / 滚动更新脚本
# 版本：V3.1（2026-06-19 重构）
#
# 用法：
#   ./deploy.sh                # 默认滚动更新（保留 :prev tag 用于回滚）
#   ./deploy.sh rollback       # 回滚到上一版本
#   ./deploy.sh status         # 查看当前服务状态
#
# 前置：
#   - 服务器已初始化（§1-3）
#   - .env 已放在 /opt/ai-sales/.env（chmod 600）
#   - 代码已上传到 /opt/ai-sales/ai-sales-saas/

set -euo pipefail

# ===== 配置 =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 默认从仓库根目录运行，也可被外部覆盖
cd "$SCRIPT_DIR"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "❌ $*"; exit 1; }

# ===== 命令分发 =====
CMD="${1:-update}"

case "$CMD" in
  rollback)
    log "=========================================="
    log "  回滚到上一版本"
    log "=========================================="

    # 检查 :prev 镜像是否存在
    if ! docker image inspect ai-sales-saas-api:prev > /dev/null 2>&1; then
      die "未找到 :prev 镜像（从未做过更新？或已无上一版本）"
    fi

    log "[1/5] 停止当前容器"
    docker compose -f "$COMPOSE_FILE" down

    log "[2/5] 切换镜像 tag（prev → latest）"
    docker tag ai-sales-saas-api:prev ai-sales-saas-api:latest
    docker tag ai-sales-saas-web:prev ai-sales-saas-web:latest

    log "[3/5] 启动回滚后的容器"
    docker compose -f "$COMPOSE_FILE" up -d

    log "[4/5] 等待健康"
    sleep 20
    if docker compose -f "$COMPOSE_FILE" exec -T api wget -qO- http://127.0.0.1:3000/health > /dev/null 2>&1; then
      log "  ✓ API 健康"
    else
      log "  ⚠ API 健康检查失败，请手动查看"
    fi

    log "[5/5] 回滚完成"
    log "=========================================="
    log "  回滚完成 ✅"
    log "=========================================="
    ;;

  status)
    log "=========================================="
    log "  服务状态"
    log "=========================================="
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    log "镜像版本："
    docker images ai-sales-saas-api ai-sales-saas-web --format "  {{.Repository}}:{{.Tag}} {{.CreatedSince}} {{.Size}}"
    echo ""
    log "健康检查（最近 5 分钟日志）："
    docker compose -f "$COMPOSE_FILE" logs --since=5m --tail=10 2>&1 | sed 's/^/  /'
    ;;

  update|"")
    log "=========================================="
    log "  滚动更新（保留 :prev tag）"
    log "=========================================="

    # 检查 .env 是否存在
    if [ ! -f /opt/ai-sales/.env ]; then
      die ".env 不存在：/opt/ai-sales/.env"
    fi

    # 1. 保留当前镜像为 :prev（首次部署会跳过）
    log "[1/6] 保留当前镜像为 :prev（首次会跳过）"
    for svc in api web; do
      IMG="ai-sales-saas-${svc}"
      if docker image inspect "$IMG:latest" > /dev/null 2>&1; then
        docker tag "$IMG:latest" "$IMG:prev" 2>&1 | sed 's/^/    /' || true
        log "  ✓ $IMG:prev 已更新"
      else
        log "  - $IMG:latest 不存在（首次部署），跳过"
      fi
    done

    # 2. 重新构建镜像
    log "[2/6] 重新构建 api + web 镜像"
    docker compose -f "$COMPOSE_FILE" build api web 2>&1 | tail -10

    # 3. 数据库迁移（如果有新迁移，会自动跑；否则无操作）
    log "[3/6] 数据库迁移（自动，无新迁移则秒返）"
    # 启动临时容器跑迁移，避免污染原 api 容器
    docker compose -f "$COMPOSE_FILE" run --rm api \
      sh -c "cd apps/api && pnpm prisma migrate deploy" 2>&1 | tail -8 | sed 's/^/    /'

    # 4. 滚动更新 api
    log "[4/6] 滚动更新 api"
    docker compose -f "$COMPOSE_FILE" up -d api
    sleep 15

    # 5. 健康检查 api
    log "[5/6] api 健康检查"
    RETRY=0
    MAX_RETRY=6
    while [ $RETRY -lt $MAX_RETRY ]; do
      if docker compose -f "$COMPOSE_FILE" exec -T api wget -qO- http://127.0.0.1:3000/health > /dev/null 2>&1; then
        log "  ✓ api 健康"
        break
      fi
      RETRY=$((RETRY + 1))
      log "  ⏳ api 未就绪（$RETRY/$MAX_RETRY），再等 10 秒"
      sleep 10
    done
    if [ $RETRY -ge $MAX_RETRY ]; then
      log "  ⚠ api 健康检查超时，请手动查看日志"
      log "    恢复命令：./deploy.sh rollback"
      exit 1
    fi

    # 6. 更新 web
    log "[6/6] 更新 web"
    docker compose -f "$COMPOSE_FILE" up -d web

    # 7. 清理旧镜像（保留当前 + prev）
    log "[7/6] 清理悬空镜像"
    docker image prune -f

    log "=========================================="
    log "  更新完成 ✅"
    log "  当前版本：ai-sales-saas-api:latest"
    log "  上一版本：ai-sales-saas-api:prev（保留）"
    log "  回滚命令：./deploy.sh rollback"
    log "=========================================="
    ;;

  *)
    cat <<EOF
AI 销售管理系统 — 部署脚本

用法:
  $(basename "$0")                # 滚动更新（保留 :prev）
  $(basename "$0") rollback       # 回滚到 :prev
  $(basename "$0") status         # 查看服务状态
EOF
    exit 1
    ;;
esac