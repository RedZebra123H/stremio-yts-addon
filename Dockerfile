# Addon container. Node 22 (global fetch, dgram UDP for tracker scraping).
FROM node:22-alpine

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV PORT=7000
EXPOSE 7000

CMD ["node", "server.js"]
