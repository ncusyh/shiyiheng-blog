FROM node:24-alpine
WORKDIR /app
# 注意：本项目用 Node 内置 node:sqlite，不需要 python/make/g++ 编译原生模块。
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p uploads data
EXPOSE 3000
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/blog.db
CMD ["node", "server.js"]
