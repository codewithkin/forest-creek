# Build from the monorepo root: docker build -f apps/agent/Dockerfile .
#
# Same install pattern as apps/server (pnpm's standalone installer inside the Bun image),
# plus the Chromium that whatsapp-web.js drives.
FROM oven/bun:1

WORKDIR /app

# chromium and its fonts: whatsapp-web.js renders the real WhatsApp Web page. The rest match
# the server: Prisma and TLS, the pnpm installer, and the libatomic it links against.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
     openssl ca-certificates curl libatomic1 \
     chromium fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

# Installs go through pnpm because the workspace uses the catalog: protocol. pnpm 11 run
# under Bun's engine fails on node:sqlite, so use the standalone installer, which bundles
# its own Node. SHELL is set because the installer's `pnpm setup` needs one to exist.
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV SHELL=/bin/bash
RUN curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=11.4.0 sh - \
  && pnpm --version

# Platforms that inject NODE_ENV=production at build make pnpm skip devDependencies.
ENV NODE_ENV=development
# Chromium comes from apt above; puppeteer must not download a second copy.
ENV PUPPETEER_SKIP_DOWNLOAD=1

# Manifests first, for layer caching. The agent needs only ai, db, env, config and payments
# (db's payments.ts imports it) — not the API, auth, storage or UI packages.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/env/package.json packages/env/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY packages/payments/package.json packages/payments/
COPY apps/agent/package.json apps/agent/

# db's postinstall runs `prisma generate` during the install, so the schema must be here.
COPY packages/db/prisma.config.ts packages/db/
COPY packages/db/prisma/ packages/db/prisma/

# prisma.config.ts throws without DATABASE_URL even for generate. A placeholder; the real
# value is injected when the container starts.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=${DATABASE_URL}

RUN pnpm install --frozen-lockfile

COPY packages/config/ packages/config/
COPY packages/env/ packages/env/
COPY packages/db/ packages/db/
COPY packages/ai/ packages/ai/
COPY packages/payments/ packages/payments/
COPY apps/agent/ apps/agent/

RUN pnpm --filter @forest-creek/db db:generate

ENV NODE_ENV=production
ENV AGENT_PORT=3002
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV WHATSAPP_SESSION_PATH=/app/apps/agent/.wwebjs_auth

# The paired session is a login: persist it, or every redeploy needs a fresh QR scan.
VOLUME ["/app/apps/agent/.wwebjs_auth"]

EXPOSE 3002

WORKDIR /app/apps/agent

# Waiting for a QR scan is healthy; only a failed client is not. Chromium is slow to start,
# hence the long start period.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD bun -e "fetch('http://localhost:3002/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# No migrations here: the server owns them, and two containers migrating at once would race.
CMD ["bun", "run", "src/index.ts"]
