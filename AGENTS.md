# AGENTS.md

Forest Creek (Vumba, Zimbabwe) — a MULTI-PROPERTY BnB group: booking site + AI concierge ("The Vumba Guide") + a manager dashboard, rebuilt from the `base-44/` static prototype into this Better-T-Stack monorepo. pnpm 11.4 + Turborepo (`turbo.json` sets `ui: tui`), Bun runs the server, Node runs Next.js/web.

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
- Auth instance in `packages/auth`, mounted in `apps/server`. Guests are anonymous for booking/chat — only staff sign in, and `/login` is sign-in only (no public sign-up). See Roles below.

## AI concierge (`packages/ai`)
- Mastra Agent from `@mastra/core/agent`, tools via `createTool` from `@mastra/core/tools`. Model string comes from `OPENROUTER_MODEL` (default `openrouter/deepseek/deepseek-v3.2`) with `OPENROUTER_API_KEY` (DeepSeek chosen for tool-calling reliability). The route/model resolves via models.dev gateway at construct time — verify there before debugging.
- Guest history is passed explicitly as a message array from `ChatMessage` rows — do NOT rely on Mastra thread memory. Map `admin` messages to `assistant` with a `[Staff]` prefix so the agent doesn't claim staff words.

## Data access lives in `packages/db` (important)
- EVERY query/mutation is written ONCE in `packages/db` (`properties|rooms|activities|bookings|chat|analytics.ts`) together with its zod input schema, and is consumed by BOTH `packages/api` (tRPC) and `packages/ai` (Mastra tools). Never write a query in a router or a tool.
- One shared Prisma client (`db/client.ts`), cached on globalThis outside production because `bun run --hot` would otherwise leak a pool per reload. `packages/auth` imports that instance — do not call `createPrismaClient()` again.

## Multi-property
- Everything hangs off `Property`: rooms, activities, bookings and chats. `Room.tier` and `Activity.slug` are unique PER PROPERTY (`@@unique([propertyId, tier])`), not globally.
- Bookings snapshot `propertyName` and `roomName`/`roomRate` at write time; a rename or reprice must never rewrite history.
- Public routes: `/` lists properties, `/<slug>` is one property, `/book?property=<slug>` preselects it.

## Roles
- `admin` (owner) sees every property; `manager` is scoped through `StaffProperty`; `guest` has no dashboard.
- In tRPC use `staffProcedure` (resolves `ctx.staff.propertyIds` = `"all" | string[]`) and narrow with `scopeProperties()` / `assertPropertyAccess()`. `adminProcedure` is owner-only. A manager passing another property's id gets FORBIDDEN.

## KPIs (`packages/db/src/analytics.ts`)
- Occupancy = room-nights sold / (active rooms x nights in window). ADR = room revenue / nights sold. RevPAR = room revenue / room-nights available. `RevPAR == ADR x occupancy` is the invariant to check when changing this.
- A stay straddling the window edge only counts the nights inside it, or long stays push occupancy over 100%.
- Group totals are recomputed from SUMMED room-nights, never averaged across properties.

## Domain model (don't invent enums)
- Booking: `bookingStatus` = `pending|confirmed|cancelled`; `paymentStatus` = `pending|verified|rejected`; `paymentMethod` = `card|paypal|bank_transfer`.
- `User.role` = `admin|manager|guest`. `role` is exposed on the session via better-auth `user.additionalFields` with `input: false` — without that flag a sign-up could set its own role.
- `ChatMessage.sender` = `guest|ai|admin`, one thread per `sessionId` (client-generated id per chat widget).
- Images: seed images are `/media/*` paths served by the API from `apps/server/public/media/` (:3000); uploaded images are absolute R2 URLs. Use `resolveImage()` on the web side, which handles both.

## Images / Cloudflare R2 (`packages/storage`)
- Uploads are presigned PUTs straight from the browser to R2; bytes never pass through the API. `content-length` is signed in, so R2 itself rejects an oversized body.
- All `R2_*` vars are optional; unconfigured, `uploads.status` reports `configured: false` and the dashboard falls back to pasting a URL.

## Web (`apps/web`) — Next.js 16
- Pages that read the API MUST set `export const dynamic = "force-dynamic"`. The Docker build runs `next build` with no API reachable, so a prerendered page fails the image build — and would freeze room rates into the bundle.
- `lib/api.ts` is the plain tRPC client for server components; `utils/trpc.ts` is the client-side one (query cache + toasts). Do not import the latter on the server.
- `typedRoutes` cannot infer `Link`'s generic from a union of hrefs — type such arrays as `Route`. New route folders need `next build` (or a dev restart) before their types exist.
- Read `apps/web/AGENTS.md` (dev-generated, keep that block intact): this is Next 16 — async `searchParams`/`params`/`headers()`, Turbopack default, typed routes, no `next lint`.
## WhatsApp agent (`apps/agent`)
- Hono on Bun + whatsapp-web.js. It must run on Bun: the Prisma client is generated with `runtime = "bun"`. Chromium comes from `PUPPETEER_EXECUTABLE_PATH` (Docker) or a system Chrome; puppeteer's own download is disabled in `allowBuilds`.
- Pair the lodge phone at `GET /whatsapp/qr` (port 3002). The session lives in `WHATSAPP_SESSION_PATH` — persist it, or every deploy needs a rescan.
- Pipeline (`src/reply.ts`): persist guest turn → generate with `getBookingAgent()` → `groundReply()` → `toWhatsappText()` → persist → send. Keep it free of whatsapp-web.js so it stays testable.
- NEVER send model text unchecked. `src/grounding.ts` blocks any quoted `FC-XXXXXX` that does not exist or is not this guest's, and any bank/account detail not returned verbatim by `request-payment`. This exists because the model once invented both a reference and a bank account.
- The guest's phone reaches `create-booking` via Mastra `requestContext` (`buildGuestContext`), never as a tool input.
- Payments: `request-payment` only issues instructions and stamps `paymentRequestedAt`; no money moves. Staff verification is still what flips `paymentStatus`.
- Tests: `pnpm --filter agent test` is hermetic (deletes the OpenRouter key, never launches a browser). `pnpm --filter agent test:e2e` talks to the real model and costs tokens; it lives in `e2e/` because bun runs every loaded test file in one process.
