FROM node:20-alpine

WORKDIR /app

# 仅复制依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 业务代码（不含 .env，配置全部由 compose 环境变量注入）
COPY src ./src
COPY scripts ./scripts
COPY sql ./sql

ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/app/uploads

# 本地驱动上传文件持久化
VOLUME ["/app/uploads"]

EXPOSE 4000

# 启动流程：建库/迁移（幂等）→ 演示种子（空库才写）→ 启动服务
CMD ["sh", "-c", "node scripts/init-db.js && node scripts/seed.js && exec node src/index.js"]
