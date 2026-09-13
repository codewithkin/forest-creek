FROM node:24-slim AS builder
RUN npm install -g pnpm@11
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1
# prisma generate resolves DATABASE_URL at install time; the real value comes from compose at runtime
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
# Chromium comes from the runtime image, so puppeteer must not fetch its own.
ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

FROM oven/bun:1-debian AS runner
WORKDIR /app
ENV NODE_ENV=production

# whatsapp-web.js drives a real browser. Chromium plus the fonts it needs to
# render the WhatsApp Web page, and nothing else.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     chromium \
     ca-certificates \
     fonts-liberation \
     fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Mounted as a volume in compose; losing it means rescanning the pairing QR.
ENV WHATSAPP_SESSION_PATH=/app/apps/agent/.wwebjs_auth

COPY --from=builder /app /app

EXPOSE 3002

WORKDIR /app/apps/agent
CMD ["bun", "run", "src/index.ts"]
