# AGENTS.md

Forest Creek (Vumba, Zimbabwe) — a MULTI-PROPERTY BnB group: booking site + AI concierge ("The Vumba Guide") + a manager dashboard, rebuilt from the `base-44/` static prototype into this Better-T-Stack monorepo. pnpm 11.4 + Turborepo (`turbo.json` sets `ui: tui`), Bun runs the server, Node runs Next.js/web.

## Run / verify
- `pnpm dev` starts everything; web = `:3001`, API/auth = `:3000` (`CORS_ORIGIN`=`http://localhost:3001` in `apps/server/.env`).
- Single app: `pnpm dev:web`, `pnpm dev:server`, `pnpm dev:native`.
- `bun run --hot` in `apps/server` does NOT watch `packages/*` ("not in the project directory and will not be watched"). After editing `packages/ai`, `packages/db` or `packages/api`, restart the server, or you will test stale code.
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
- Always call the agents through `runConcierge` / `runBookingAgent` (`src/run.ts`), never `agent.generate` directly: they report the served model, provider, tools, cost and latency, and the evals measure exactly that path.
- NEVER show `result.text`. Mastra joins every step, and text from a step that also called a tool was written before the tool returned (it once invented two properties). `finalReplyText` (`src/reply-text.ts`) keeps only the last tool-free step; empty means send a failure reply.
- Business facts (name, hosts, contact, currency) live only in `src/brand.ts`; the one booking link is `bookingPageUrl` in `src/links.ts`. Prompts must not hardcode either, and must never name an AI vendor or model.
- Both surfaces run `groundReply()` (`src/grounding.ts`, import-free); the website passes `guestPhone: null`.
- Do NOT rely on `toolChoice: "required"`. In a direct probe only 1 of 6 OpenRouter upstreams for DeepSeek honoured it, and `provider.require_parameters` made it worse (it routed to one that claims support and ignores it). `groundFirstStep` still sets it and limits step 0 to read-only tools (enforced client-side), but the real guard is `calledAnyTool`: a run that called no tool is retried once. Routing is set per call in `run.ts` via `providerOptions.openrouter.provider` (verified to reach OpenRouter): Novita is ignored (every tool-less reply that survived a retry came from it) and the retry prefers SiliconFlow (the only upstream that honoured tool_choice), with fallbacks on.

## Evals (`apps/evals`)
- `pnpm eval` sends real messages through all five surfaces (concierge direct, tRPC router, HTTP, booking agent, full WhatsApp pipeline) and needs the API on `:3000`. Costs tokens; reports go to `apps/evals/reports/` (gitignored).
- Deterministic checks (`src/checks.ts`, unit tested) run first; an LLM judge from a DIFFERENT vendor grades relevance/accuracy/rubric. `pnpm --filter evals eval:calibrate` must agree unanimously with the fixtures before judge scores are trusted (exit 3 otherwise).
- Model identity is an EXACT match against `OPENROUTER_MODEL` minus `openrouter/`; don't loosen it.
- When the judge flags a true statement as invented, the fix is to give it the fact (ground truth, availability facts), not to soften the rubric.

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
- Booking: `bookingStatus` = `pending|confirmed|cancelled`; `paymentStatus` = `pending|processing|verified|rejected`; `paymentMethod` = `ecocash|onemoney` (mobile money only — see Payments below).
- `User.role` = `admin|manager|guest`. `role` is exposed on the session via better-auth `user.additionalFields` with `input: false` — without that flag a sign-up could set its own role.
- `ChatMessage.sender` = `guest|ai|admin`, one thread per `sessionId` (client-generated id per chat widget).
- Images: seed images are `/media/*` paths served by the API from `apps/server/public/media/` (:3000); uploaded images are absolute R2 URLs. Use `resolveImage()` on the web side, which handles both.

## Images / Cloudflare R2 (`packages/storage`)
- Uploads are presigned PUTs straight from the browser to R2; bytes never pass through the API. `content-length` is signed in, so R2 itself rejects an oversized body.
- All `R2_*` vars are optional; unconfigured, `uploads.status` reports `configured: false` and the dashboard falls back to pasting a URL.

## Payments (`packages/payments`) — Paynow, mobile money only
- Ecocash and OneMoney only, via the `paynow` SDK. `PAYNOW_INTEGRATION_ID`/`PAYNOW_INTEGRATION_KEY` are optional — unconfigured, `initiateMobileMoneyPayment` returns `{ ok: false }` with `PAYMENT_NOT_CONFIGURED_MESSAGE` rather than crashing, same pattern as R2.
- Split the same way `run.ts`/`reply-text.ts` in `packages/ai` are: `gateway.ts` is import-free and DI-tested (pass a fake `PaynowClient`, no env, no network); `index.ts` wires the real SDK behind a lazily-built client and is what everything else imports.
- The `paynow` package ships no types — `src/paynow.d.ts` declares them, pulled into any consumer via a `/// <reference path=...>` in `index.ts` (a sibling ambient `.d.ts` is never picked up just because another file in the same folder got imported).
- Orchestration (call Paynow, then persist the result) lives in `packages/db/src/payments.ts`, not here — same "written once, used by both api and ai" rule as everything else in `packages/db`. `initiateMobileMoneyPayment` marks a booking `processing`; `checkMobileMoneyPayment` polls it. **Only Paynow reporting a charge paid auto-confirms a booking** (`paymentStatus: verified`, `bookingStatus: confirmed`, `verifiedBy: "Paynow"`) — a cancelled or still-pending poll leaves it `processing` so the guest can retry, never auto-rejects.
- The mobile money number is ALWAYS asked for explicitly (WhatsApp prompt, and its own field in the booking wizard) — never assumed from `guestPhone` or the WhatsApp number, since a guest's mobile money account is often on a different number or network.
- No webhook receiver yet — Paynow's `resultUrl`/`returnUrl` are placeholders (see the comment in `packages/payments/src/index.ts`). Status is read by polling only; add a real result endpoint before relying on the webhook in production.
- `packages/ai/src/grounding.ts`'s guard extends to payments: a reply claiming a charge succeeded is blocked unless `check-payment-status` returned `paid: true` this turn — the same principle as the invented-reference guard, just for money instead of bookings.

## Web (`apps/web`) — Next.js 16
- Pages that read the API MUST set `export const dynamic = "force-dynamic"`. The Docker build runs `next build` with no API reachable, so a prerendered page fails the image build — and would freeze room rates into the bundle.
- `lib/api.ts` is the plain tRPC client for server components; `utils/trpc.ts` is the client-side one (query cache + toasts). Do not import the latter on the server.
- `typedRoutes` cannot infer `Link`'s generic from a union of hrefs — type such arrays as `Route`. New route folders need `next build` (or a dev restart) before their types exist.
- Read `apps/web/AGENTS.md` (dev-generated, keep that block intact): this is Next 16 — async `searchParams`/`params`/`headers()`, Turbopack default, typed routes, no `next lint`.
## WhatsApp agent (`apps/agent`)
- Hono on Bun + whatsapp-web.js. It must run on Bun: the Prisma client is generated with `runtime = "bun"`. Chromium comes from `PUPPETEER_EXECUTABLE_PATH` (Docker) or a system Chrome; puppeteer's own download is disabled in `allowBuilds`.
- Pair the lodge phone at `GET /whatsapp/qr` (port 3002). The session lives in `WHATSAPP_SESSION_PATH` — persist it, or every deploy needs a rescan.
- Pipeline (`src/reply.ts`): persist guest turn → generate with `getBookingAgent()` → `groundReply()` → `toWhatsappText()` → persist → send. Keep it free of whatsapp-web.js so it stays testable.
- NEVER send model text unchecked. `groundReply` (`packages/ai/src/grounding.ts`) blocks any quoted `FC-XXXXXX` the guest didn't type that does not exist or is not this guest's, any payment-detail-shaped text not returned verbatim by `request-payment`, and any claim that a payment succeeded that `check-payment-status` didn't confirm this turn. This exists because the model once invented both a reference and a bank account.
- The guest's phone reaches `create-booking` via Mastra `requestContext` (`buildGuestContext`), never as a tool input.
- `create-booking` is two calls. The first returns `needsConfirmation` + `readBack` and books nothing; the same details from the same guest in a LATER turn (a new `turnId`, generated per `buildGuestContext`) make the booking. This is `ConfirmationGate` (`packages/ai/src/confirmation.ts`) — prompt rules alone let the agent book before the guest confirmed. Tests must call it twice with different turn ids.
- Payments (see the Payments section above): `request-payment` sends a real Ecocash/OneMoney charge and stamps `paymentRequestedAt`; `check-payment-status` is the only thing that can report it paid.
- Tests: `pnpm --filter agent test` is hermetic (deletes the OpenRouter key, never launches a browser). `pnpm --filter agent test:e2e` talks to the real model and costs tokens; it lives in `e2e/` because bun runs every loaded test file in one process.
