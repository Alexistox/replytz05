# Userbot Telegram (Node + GramJS)
FROM node:20-alpine

WORKDIR /app

# Tini: xử lý signal SIGTERM khi docker stop
RUN apk add --no-cache tini

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY index.js utils.js ./
COPY config.example.js ./config.example.js

ENV NODE_ENV=production

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
