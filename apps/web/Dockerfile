# Build from the monorepo root: docker build -f apps/web/Dockerfile .
#
# Follows the web Dockerfile deployed in viraltiktokslideshows, with one deliberate
# difference: this app sets output: "standalone", so the runtime image carries only the
# traced server bundle rather than the whole node_modules tree.
FROM node:24-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.4.0 --activate

# The web app imports the API's router types, which reach packages/db, whose postinstall
# runs prisma generate. openssl keeps that step working on a slim image.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Platforms that inject NODE_ENV=production at build would make pnpm skip devDependencies.
ENV NODE_ENV=development

# Manifests first, for layer caching. Typechecking follows AppRouter into api, ai, auth, db,
# payments and storage, so their manifests and sources are needed to build the web app — not
# to run it.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/env/package.json packages/env/
COPY packages/ui/package.json packages/ui/
COPY packages/db/package.json packages/db/
COPY packages/auth/package.json packages/auth/
COPY packages/ai/package.json packages/ai/
COPY packages/storage/package.json packages/storage/
COPY packages/payments/package.json packages/payments/
COPY packages/api/package.json packages/api/
COPY apps/web/package.json apps/web/

COPY packages/db/prisma.config.ts packages/db/
COPY packages/db/prisma/ packages/db/prisma/

ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=${DATABASE_URL}

# Read at the top of next.config.ts and baked into the client bundle at build time; the env
# schema throws without it. Override with --build-arg NEXT_PUBLIC_SERVER_URL=https://api...
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3000
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}

RUN pnpm install --frozen-lockfile

COPY packages/config/ packages/config/
COPY packages/env/ packages/env/
COPY packages/ui/ packages/ui/
COPY packages/db/ packages/db/
COPY packages/auth/ packages/auth/
COPY packages/ai/ packages/ai/
COPY packages/storage/ packages/storage/
COPY packages/payments/ packages/payments/
COPY packages/api/ packages/api/
COPY apps/web/ apps/web/

RUN pnpm --filter @forest-creek/db db:generate
RUN NODE_ENV=production pnpm --filter web build
# Standalone output leaves public/ out; make sure it exists so the copy below never fails.
RUN mkdir -p apps/web/public

# ---- Runner ----
FROM node:24-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

# Owned by the image's unprivileged user, so Next can write its cache without root.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:3001/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# SERVER_URL is read at runtime by server components, so they reach the API over the
# internal network (for example http://server:3000) instead of the public URL.
CMD ["node", "apps/web/server.js"]
