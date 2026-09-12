FROM node:24-slim AS builder
RUN npm install -g pnpm@11
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1
# prisma generate resolves DATABASE_URL at install time; the real value comes from compose at runtime
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

ENV NODE_ENV=production
RUN cd apps/server && pnpm run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["bun", "dist/index.mjs"]
