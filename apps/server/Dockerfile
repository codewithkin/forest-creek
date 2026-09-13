# Build from the monorepo root: docker build -f apps/server/Dockerfile .
#
# Follows the server Dockerfile already deployed in viraltiktokslideshows, which shares this
# stack (pnpm workspaces with catalog:, Bun runtime, Hono, Prisma 7), carrying its fixes.
FROM oven/bun:1

WORKDIR /app

# openssl/ca-certificates: Prisma and TLS to a managed Postgres. curl: fetches the pnpm
# installer. libatomic1: the pnpm standalone build links it and this image ships without it.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl libatomic1 \
  && rm -rf /var/lib/apt/lists/*

# Installs go through pnpm because the workspace uses the catalog: protocol. pnpm 11 run
# under Bun's engine fails on node:sqlite, so use the standalone installer, which bundles its
# own Node. SHELL is set because the installer's `pnpm setup` step needs one to exist.
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV SHELL=/bin/bash
RUN curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=11.4.0 sh - \
  && pnpm --version

# Platforms that inject NODE_ENV=production at build time make pnpm skip devDependencies —
# tsdown, typescript and prisma, all needed below. Held back until the runtime ENV.
ENV NODE_ENV=development

# Manifests first, for layer caching. The server pulls in api, which pulls in ai, auth, db,
# storage and env.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/env/package.json packages/env/
COPY packages/db/package.json packages/db/
COPY packages/auth/package.json packages/auth/
COPY packages/ai/package.json packages/ai/
COPY packages/storage/package.json packages/storage/
COPY packages/api/package.json packages/api/
COPY apps/server/package.json apps/server/

# db's postinstall runs `prisma generate` during the install, so the schema must already be
# here or the whole install fails with "Could not find Prisma Schema".
COPY packages/db/prisma.config.ts packages/db/
COPY packages/db/prisma/ packages/db/prisma/

# prisma.config.ts throws when DATABASE_URL is missing entirely, even for generate. This is a
# placeholder; the real value is injected when the container starts.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=${DATABASE_URL}

RUN pnpm install --frozen-lockfile

# Sources after the install, for layer caching.
COPY packages/config/ packages/config/
COPY packages/env/ packages/env/
COPY packages/db/ packages/db/
COPY packages/auth/ packages/auth/
COPY packages/ai/ packages/ai/
COPY packages/storage/ packages/storage/
COPY packages/api/ packages/api/
COPY apps/server/ apps/server/

RUN pnpm --filter @forest-creek/db db:generate
RUN pnpm --filter server build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

WORKDIR /app/apps/server

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD bun -e "fetch('http://localhost:3000/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Migrations apply at start, not build: they need the real DATABASE_URL and a route to the
# database, which only the running container has. The schema has so far been applied with
# `prisma db push` and there are no migrations yet, so this is a no-op until a baseline
# migration exists. `exec` gives PID 1 to bun so SIGTERM reaches it for a clean shutdown.
CMD ["sh", "-c", "cd /app/packages/db && pnpm exec prisma migrate deploy && cd /app/apps/server && exec bun run dist/index.mjs"]
