# AGENTS.md

Forest Creek Lodge (Vumba, Zimbabwe) — BnB booking + AI concierge ("The Vumba Guide"), rebuilt from the `base-44/` static prototype into this Better-T-Stack monorepo. pnpm 11.4 + Turborepo (`turbo.json` sets `ui: tui`), Bun runs the server, Node runs Next.js/web.

## Run / verify
- `pnpm dev` starts everything; web = `:3001`, API/auth = `:3000` (`CORS_ORIGIN`=`http://localhost:3001` in `apps/server/.env`).
- Single app: `pnpm dev:web`, `pnpm dev:server`, `pnpm dev:native`.
- Typecheck: `pnpm check-types` (runs `tsc -b` per package). Server bundles with tsdown from `apps/server`.
- There is NO eslint in this repo (no configs) and Next 16 removed `next lint` — do not add/run `lint` scripts.

## DB (Prisma 7 + Postgres)
- Schema is split across MULTIPLE files in `packages/db/prisma/schema/` (`schema.prisma` + `auth.prisma`). Don't create a single-file schema.
- Client is generated TS (bun runtime) at `packages/db/prisma/generated/` and re-exported via `@forest-creek/db` (`createPrismaClient()`). Driver adapter only (`PrismaPg`) — never pass `datasourceUrl` to `new PrismaClient()`.
- `packages/db/prisma.config.ts` loads env from `apps/server/.env`, so run prisma CLI from `packages/db`:
  - `pnpm exec prisma generate` / `pnpm exec prisma db push`
  - The turbo `db:*` tasks are marked interactive + `ui: tui`, so `pnpm db:generate` / `pnpm db:push` FAIL in non-TTY shells — use the direct commands above.
- After changing models: edit schema → `prisma generate` → `prisma db push` → seed. `postinstall` regenerates the client.
- Local DB: `postgresql://postgres:admin@localhost:5432/forest-creek` (Postgres `forest-creek`, user `postgres`, password `admin`, set in `apps/server/.env` which is gitignored).

## Seed
- `apps/server/src/seed.ts`; run `bun run src/seed.ts` from `apps/server`. Seeds 3 rooms (tiers `executive|family|standard`), sample activities, and admin.
- Admin must be created the better-auth way or login silently fails: credential account rows need `issuer: "local:credential"` and a password hashed with `hashPassword()` from `better-auth/crypto` (plain string, no pepper/secret). Copy the pattern in `seed.ts`.

## Env / auth
- All env is validated at import by `@forest-creek/env` (t3-env), split into `server`/`web`/`native` (see `packages/env/src/server.ts`). Adding a server var means updating that file + `apps/server/.env` + `apps/server/.env.example`.
- better-auth 1.7.1 is PINNED in the `pnpm-workspace.yaml` catalog — don't bump casually, its API drifts between minors.
- Auth instance in `packages/auth`, mounted in `apps/server`. `User` has a `role` column (`admin`/`guest`); guests are anonymous for booking/chat, only admin needs a login.

## AI concierge (`packages/ai`)
- Mastra Agent from `@mastra/core/agent`, tools via `createTool` from `@mastra/core/tools`. Model string comes from `OPENROUTER_MODEL` (default `openrouter/deepseek/deepseek-v3.2`) with `OPENROUTER_API_KEY` (DeepSeek chosen for tool-calling reliability). The route/model resolves via models.dev gateway at construct time — verify there before debugging.
- Guest history is passed explicitly as a message array from `ChatMessage` rows — do NOT rely on Mastra thread memory. Map `admin` messages to `assistant` with a `[Staff]` prefix so the agent doesn't claim staff words.

## Domain model (don't invent enums)
- Booking: `bookingStatus` = `pending|confirmed|cancelled`; `paymentStatus` = `pending|verified|rejected`; `paymentMethod` = `card|paypal|bank_transfer`.
- `ChatMessage.sender` = `guest|ai|admin`, one thread per `sessionId` (client-generated id per chat widget).
- `Room.image` / `Activity.image` are `/media/*` paths served by the API from `apps/server/public/media/` (server port :3000).

## Web (`apps/web`) — Next.js 16
- Read `apps/web/AGENTS.md` (dev-generated, keep that block intact): this is Next 16 — async `searchParams`/`params`/`headers()`, Turbopack default, typed routes, no `next lint`.