FROM node:20-alpine

WORKDIR /app

# 1. Зависимости корневого пакета (express, node-cron, etc.)
COPY package*.json ./
RUN npm ci --omit=dev

# 2. Зависимости public/ (supabase, groq — нужны API-обработчикам)
COPY public/package*.json ./public/
RUN cd public && npm ci --omit=dev

# 3. Исходный код
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
