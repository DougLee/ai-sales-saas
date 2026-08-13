# 构建阶段
FROM node:22-alpine AS builder
WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# 复制依赖文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# 安装依赖（含 workspace）
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# 生成 Prisma Client
RUN cd apps/api && pnpm prisma generate

# 构建共享包（API 依赖其类型）
RUN pnpm --filter @ai-sales/shared build

# 构建 TypeScript
RUN pnpm --filter @ai-sales/api build

# 运行阶段
FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# 复制依赖文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# 安装全部依赖（Prisma CLI 在 devDeps，runner 需要它做 migrate）
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production

# 复制构建产物
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# 暴露端口
EXPOSE 3000

# 启动命令：先 generate Prisma Client，再迁移数据库，最后启动服务
# （runner 阶段 pnpm install 不会自动跑 prisma generate，必须显式调用）
CMD ["sh", "-c", "cd apps/api && pnpm prisma generate && pnpm prisma migrate deploy && node dist/main.js"]
