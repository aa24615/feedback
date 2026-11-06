# ---------- 构建阶段 ----------
FROM node:20-alpine AS build

WORKDIR /app

# 前端 API 基础地址：构建时由 compose build.args / docker build --build-arg 注入。
# 留空则使用相对路径 /api（由 web 的 nginx 反代到 backend）；生产可设为独立 API 域名。
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- 运行阶段 ----------
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
# 主配置：把 PID 改到可写的 /tmp（默认 /run 在部分环境下不可写）
COPY nginx.main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
