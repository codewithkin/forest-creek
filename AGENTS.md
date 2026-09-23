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
  - `pnpm exec prisma generate` / `pnpm exec prisma migrate deploy` / `pnpm exec prisma migrate dev`
  - The turbo `db:*` tasks are marked interactive + `ui: tui`, so the `pnpm db:*` aliases FAIL in non-TTY shells — use the direct commands above.
- Migrations are the source of truth for the DB schema (NOT `db push`). The baseline `0000_init` in `packages/db/prisma/migrations/` was generated from the schema; both local dev and prod DBs are migration-managed (`0000_init` recorded as applied, schema verified drift-free).
- Local dev: if the dev DB was previously provisioned with `db push` (no `_prisma_migrations`), adopt it with `pnpm exec prisma migrate resolve --applied 0000_init` — never `migrate reset`, it wipes bookings/chats.
- After changing models: edit schema → `pnpm exec prisma migrate dev --name <change>` (creates and applies the migration). Prisma 7's `migrate dev` does NOT regenerate the client — run `pnpm exec prisma generate` after it, or `tsc` reports the new fields as missing. `postinstall` also regenerates.
- Prod: `prisma migrate deploy` runs on EVERY server container start (`apps/server/Dockerfile` CMD), so a new committed migration is applied on the next deploy/restart before the API accepts traffic. The web/agent images never run migrations; the server owns the schema.
- Local DB: `postgresql://postgres:admin@localhost:5432/forest-creek` (Postgres `forest-creek`, user `postgres`, password `admin`, set in `apps/server/.env` which is gitignored).

## Seed
- `apps/server/src/seed.ts`; run `bun run src/seed.ts` from `apps/server`. Seeds 3 rooms (tiers `executive|family|standard`), sample activities, and admin.
- The admin is ALSO auto-ensured on EVERY server boot (`apps/server/src/ensure-admin.ts`, called from `index.ts` before the API serves): if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are set it creates the user or repairs an existing one (role=admin, password rehashed, credential issuer `local:credential`). Locally the values live in `apps/server/.env`; on the deployed server set both env vars in Coolify.
- Admin must be created the better-auth way or login silently fails: credential account rows need `issuer: "local:credential"` and a password hashed with `hashPassword()` from `better-auth/crypto` (plain string, no pepper/secret). The pattern lives once in `ensure-admin.ts`. Don't duplicate it.

## Env / auth
- All env is validated at import by `@forest-creek/env` (t3-env), split into `server`/`web`/`native` (see `packages/env/src/server.ts`). Adding a server var means updating that file + `apps/server/.env` + `apps/server/.env.example`.
- `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` are OPTIONAL in the shared server schema, because the WhatsApp agent imports it but never mounts auth. `packages/auth` re-enforces both (and throws at startup) — a server reaching better-auth without them dies with a clear error, not a silent half-boot. `CORS_ORIGIN` stays required everywhere: `packages/ai` uses it to build the booking link, so the agent needs it set to the public web URL.
- better-auth 1.7.1 is PINNED in the `pnpm-workspace.yaml` catalog — don't bump casually, its API drifts between minors.
- Session cookies get a shared `Domain` so the web's server-side check can see them: `packages/auth` derives `.registrable-domain` from `BETTER_AUTH_URL` (overridable via `COOKIE_DOMAIN`, unset on localhost). Without it the cookie is host-only for the API, and `/dashboard` (server-side `getSession` forwards the web origin's cookies) redirect-loops `/dashboard → /login → /dashboard` even while signed in. `cookiePrefix: "fc"` means a fix mints a new cookie rather than fighting stale host-only ones.
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

## Payments (`packages/payments`) — Paynow: Ecocash, OneMoney, InnBucks, Visa
- Ecocash and OneMoney only, via the `paynow` SDK. `PAYNOW_INTEGRATION_ID`/`PAYNOW_INTEGRATION_KEY` are optional — unconfigured, `initiateMobileMoneyPayment` returns `{ ok: false }` with `PAYMENT_NOT_CONFIGURED_MESSAGE` rather than crashing, same pattern as R2.
- Split the same way `run.ts`/`reply-text.ts` in `packages/ai` are: `gateway.ts` is import-free and DI-tested (pass a fake `PaynowClient`, no env, no network); `index.ts` wires the real SDK behind a lazily-built client and is what everything else imports.
- The `paynow` package ships no types — `src/paynow.d.ts` declares them, pulled into any consumer via a `/// <reference path=...>` in `index.ts` (a sibling ambient `.d.ts` is never picked up just because another file in the same folder got imported).
- Orchestration (call Paynow, then persist the result) lives in `packages/db/src/payments.ts`, not here — same "written once, used by both api and ai" rule as everything else in `packages/db`. `initiateMobileMoneyPayment` marks a booking `processing`; `checkMobileMoneyPayment` polls it. **Only Paynow reporting a charge paid auto-confirms a booking** (`paymentStatus: verified`, `bookingStatus: confirmed`, `verifiedBy: "Paynow"`) — a cancelled or still-pending poll leaves it `processing` so the guest can retry, never auto-rejects.
- The mobile money number is ALWAYS asked for explicitly (WhatsApp prompt, and its own field in the booking wizard) — never assumed from `guestPhone` or the WhatsApp number, since a guest's mobile money account is often on a different number or network.
- Holds (`packages/db/src/hold-policy.ts`): a new booking holds its room `HOLD_MINUTES` (30); starting a payment tops it up to at least `PAYMENT_WINDOW_MINUTES` (20). Every availability read goes through `occupyingBookingWhere()` in `bookings.ts`, which ignores a lapsed unpaid hold — so correctness never waits on a job. `sweepLapsedHolds()` (run every 2 min by `apps/server/src/hold-sweeper.ts`) only relabels them `bookingStatus: "expired"`, asking Paynow once more about any charge still in flight first. Bookings from before holds have `holdExpiresAt: null` and never lapse. Any new query deciding whether a room is taken MUST use `occupyingBookingWhere()`, not `bookingStatus: { not: "cancelled" }`. Anything that checks a room is free and then claims it (createBooking, reviving a lapsed hold) must do both inside one transaction after `lockRoom(tx, roomId)` — without the row lock, six simultaneous requests produced two bookings for the same nights.
- A payment is recorded through `recordPaynowPaid` only: idempotent (`updateMany` where not yet verified), and if the hold had lapsed and someone else has the dates it records the money but leaves the stay pending with a `reviewNote` for staff, instead of double-booking.
- `/pay/[reference]` (web) pays for an existing booking with any method — where the WhatsApp agent sends InnBucks/Visa guests (`paymentPageUrl()` in `packages/ai/src/links.ts`) and where a failed payment retries. It reads `bookings.byReference`, which returns `getGuestBookingView` — NO email, phone, name or notes, because a reference is shared freely.
- Paynow's result callback lands on the API at `POST /paynow/result` (`apps/server/src/paynow-result.ts`). `parseStatusUpdate` (`packages/payments/src/status-update.ts`, import-free) checks the SHA-512 hash against the integration key before anything is read; `applyPaynowStatusUpdate` (`packages/db/src/payments.ts`) then requires the stored `paynowPollUrl` and the booking's `totalAmount` to match before a `paid` confirms anything (wrong amount → `reviewNote`, not confirmed). Forged → 400, authentic → 200 always (so Paynow stops retrying), DB failure → 500. Polling still works alongside it; both go through the idempotent `recordPaynowPaid`.
- The result URL is `SERVER_URL` (else `BETTER_AUTH_URL`) + `/paynow/result`; the WhatsApp agent has neither by default, so set `SERVER_URL` on it too. The return URL is per payment — `/pay/<reference>` — which is why `packages/payments` builds one SDK instance per charge rather than caching one.
- `packages/ai/src/grounding.ts`'s guard extends to payments: a reply claiming a charge succeeded is blocked unless `check-payment-status` returned `paid: true` this turn — the same principle as the invented-reference guard, just for money instead of bookings.

## Web (`apps/web`) — Next.js 16
- Pages that read the API MUST set `export const dynamic = "force-dynamic"`. The Docker build runs `next build` with no API reachable, so a prerendered page fails the image build — and would freeze room rates into the bundle.
- `lib/api.ts` is the plain tRPC client for server components; `utils/trpc.ts` is the client-side one (query cache + toasts). Do not import the latter on the server.
- `typedRoutes` cannot infer `Link`'s generic from a union of hrefs — type such arrays as `Route`. New route folders need `next build` (or a dev restart) before their types exist.
- Read `apps/web/AGENTS.md` (dev-generated, keep that block intact): this is Next 16 — async `searchParams`/`params`/`headers()`, Turbopack default, typed routes, no `next lint`.
## Booking & Cancellation Policy (`packages/db/src/booking-policy.ts`)
- The client's policy (effective 1 Jan 2026) lives ONLY here, import-free and unit tested: seasons (high = Jun-Oct and 15 Dec-5 Jan; 1-5 Jan counts as high, 1-14 Dec as low — both gaps in the document, decided here), `paymentPlan` (50% deposit, balance due 14 days before arrival, full payment when booking within 14 days), `CANCELLATION_TIERS`, `cancellationQuote`, `dateChangeVerdict`, `amountDueNow`. The web policy page (`/policies`, via the public `policy` router), the emails, the dashboard and the AI prompts (`packages/ai/src/policy.ts` → `policyText`) all read these numbers. Change a rule here, never in a template or prompt.
- `DEPOSIT_NON_REFUNDABLE` (true): clause 1's "non-refundable deposit" and the 90%-refund tiers contradict; read literally, a cancellation keeps the higher of the tier's fee and the deposit paid (always 50% of the stay, even when a late booking paid it all up front). That contradiction is the client's to resolve — flip the constant if the tiers should win.
- Money on a booking: `amountPaid` (all charges plus staff-recorded bank/cash), `depositAmount`, `balanceDueAt`, `paymentStatus` `partial` = deposit in, stay confirmed, balance due; `verified` = paid in full. The first payment confirms the stay.
- Paynow charges are whatever `amountDueNow` says (deposit → balance, or everything with `payInFull`). The charge in flight is `paynowChargeAmount`, cleared in the same write that credits it (`recordPaynowPaid`) — that is the idempotency, so never credit a Paynow payment any other way. Callbacks are checked against the CHARGE amount, not the stay total. Money landing after a cancellation, or beyond the total, becomes `refundStatus: "due"` plus a review note.
- `cancelBooking` applies the tiers (quote first with `getCancellationQuote`; no-show = cancelled on the day), stores `refundAmountCents`, and marks a refund due only when there is one. Refund outcomes: refunded / declined / credit (12-month voucher or postponement).
- `changeBookingDates`: one free change (low season, >21 days out); high season within 30 days is refused; anything else needs `override`. Checked under `lockRoom`, repriced at the room's current rate, emailed as `amended:<n>` (repeatable events carry a key).
- `recordManualPayment` records the policy's bank transfer / USD cash (never above what is outstanding). There is no "Mark paid" button any more — it recorded nothing about the money.
- `sendBalanceReminders` rides the hold sweeper (one email per booking); an overdue balance shows on the attention panel, and nothing is cancelled automatically (the policy does not say to).
- `createBooking` refuses a check-in before today (Zimbabwe time) — the form's date picker is not a guard.

## Booking emails (`packages/mail` + outbox)
- Every state change writes `Notification` rows via `notifyBooking(bookingId, event)` (`packages/db/src/notifications.ts`): `created`, `confirmed`, `cancelled`, `expired` (guest only), `review` (staff only). Wording lives in `notification-templates.ts` (import-free, unit tested). The staff copy goes to the PROPERTY's own `email`, not a global address.
- `notifyBooking` never throws — an email must never make a booking change look failed. Rows are unique per (booking, event, recipient), so the poller, the Paynow callback and the sweeper can all report one payment and one email goes out.
- Only the API server sends (`apps/server/src/notification-worker.ts`, every 30s). The WhatsApp agent writes to the same outbox but holds no SMTP credentials. Delivery claims each row first (safe with two workers), backs off 1/5/15/60 min, gives up after 5 tries as `failed`; staff retry from the booking's "Payment & emails" panel.
- `SMTP_*` are optional. Unconfigured, due rows are marked `skipped` (not left pending), so turning SMTP on later never mails guests stale "payment pending" messages. Adding a new booking state change? Call `notifyBooking` after the write, and only when the write actually landed (`count === 1`).
- Test delivery with `deliverDueNotifications({ send, configured, bookingIds })` — always scope `bookingIds` in tests, or a run marks real dev-DB emails sent.

## Room blocks
- `RoomBlock` (UTC-midnight `startDate`, exclusive `endDate`, like a stay) takes nights off sale. Every availability path checks blocks next to `occupyingBookingWhere()`: `isRoomAvailable`, `getAvailableRooms`, `createBooking` (under `lockRoom`), hold revival and `clashingStay`. A new "is this room free?" query must check both.
- `createRoomBlock` refuses to cover an occupying stay (staff cancel it first, which emails the guest). Blocked nights are NOT subtracted from available room-nights in the KPIs.

## Payment log and attention alerts
- `PaymentEvent` is the audit trail of what Paynow told us: every result callback (authentic ones with their outcome, forged ones as `rejected` tied to no booking, claimed reference and reason only — never the body), plus polls that confirmed a payment or failed to reach Paynow (`error`). Ordinary "not paid yet" polls are NOT logged (the pay page polls every 4s). Write via `recordPaymentEvent`, which never throws.
- `getOperationalAlerts` (`packages/db/src/alerts.ts`) drives the dashboard's "Needs attention" panel: stuck charges (`processing` > `STUCK_PAYMENT_MINUTES`), review notes, refunds due, failed emails, Paynow errors in the last hour, forged callbacks in the last day (owner only — they belong to no property), and whether Paynow/SMTP are configured. `attentionWhere()` is shared with the bookings list's `needsAttention` filter so the panel and the "Needs attention" tab always agree; change them together.
- Tests that create bookings must delete their payment events first (`booking` FK is `SET NULL`, so they would survive as orphans), and any event with a made-up reference by reference.

## Logging (no guest data in logs)
- Never pass an error object to `console.error`. Use `describeError(error)` from `@forest-creek/db/log`: type, code, first and last message lines, stack frames. Prisma errors repeat their arguments (emails, message bodies) inside the message, and AI provider errors carry the guest's whole conversation.
- The API's request logger drops query strings (`apps/server/src/request-log.ts`) because tRPC GETs carry their input in the URL.
- `paynow@2.2.2` is patched (`patches/paynow@2.2.2.patch`, applied via `pnpm-workspace.yaml` `patchedDependencies`): unpatched it logs the whole axios error, whose body has the guest's email and mobile money number. Every Dockerfile copies `patches/` before `pnpm install`; a new image must too. Patch files are pinned LF in `.gitattributes`. Bumping `paynow` means redoing the patch.
- Deliberate exception: the WhatsApp agent logs inbound messages verbatim (see below) for debugging delivery. Revisit before calling logs PII-free.

## Rate limits (`packages/api/src/rate-limit.ts`)
- `rateLimitedProcedure(name, rule, keyOf?)` — in-memory fixed window per client address (plus an optional second key). Used on the browser-called public procedures: `create`, `choosePaymentMethod`, `payWithMobileMoney`/`startWebCheckout` (also keyed per booking reference, so PIN prompts can't be pushed at one phone from many addresses) and `checkPayment`. Server-rendered `byReference` is NOT limited — the Next server calls it for every guest from one address.
- The client address is the LAST `X-Forwarded-For` hop (what Coolify's Traefik appends), else the socket. That assumes a proxy in front; exposed directly, a client can forge the header.

## WhatsApp agent (`apps/agent`)
- Hono on Bun + whatsapp-web.js. It must run on Bun: the Prisma client is generated with `runtime = "bun"`. Chromium comes from `PUPPETEER_EXECUTABLE_PATH` (Docker) or a system Chrome; puppeteer's own download is disabled in `allowBuilds`.
- Pair the lodge phone at `GET /whatsapp/qr` (port 3002). The session lives in `WHATSAPP_SESSION_PATH` (`/app/apps/agent/.wwebjs_auth` in the image). A Dockerfile `VOLUME` alone does NOT survive redeploys — attach a Coolify persistent volume at that exact path (Agent → Persistent Storage → Volume → `/app/apps/agent/.wwebjs_auth`) or every deploy forces a rescan. The path is logged at startup.
- Inbound messages are handled on `message_create`, NOT `message` — `message_create` fires for every message the device sees (including ones `message` misses); own messages are filtered via `fromMe`. If the agent is "ready" but ignores texts, the `[whatsapp]` logs show whether `message_create` ever fires at all — a count of zero means the WhatsApp socket isn't delivering, an infra issue, not the pipeline.
- `src/whatsapp.ts` logs every message verbatim (id/from/to/type/body/timestamp), every state transition (loading_screen, change_state, qr, authenticated, ready, disconnected, battery) and each pipeline stage; `src/reply.ts` logs per-session store/generate/storage stages. All timestamps are ISO, prefixed `[whatsapp]` / `[agent]`, visible in Coolify logs.
- WhatsApp messages from unknown contacts arrive with a `@lid` (Linked ID) sender whose digits are NOT a phone. `parseChatId` (src/session.ts) accepts `@lid` as a 1:1 chat; the dispatcher resolves the real number via `client.getContactLidAndPhone` and falls back to the LID digits as the guest identity. Staff replies go through `sessionIdToChatId` so a LID thread is answered to the LID, never a `@c.us` guess.
- Pipeline (`src/reply.ts`): persist guest turn → generate with `getBookingAgent()` → `groundReply()` → `toWhatsappText()` → persist → send. Keep it free of whatsapp-web.js so it stays testable.
- NEVER send model text unchecked. `groundReply` (`packages/ai/src/grounding.ts`) blocks any quoted `FC-XXXXXX` the guest didn't type that does not exist or is not this guest's, any payment-detail-shaped text not returned verbatim by `request-payment`, and any claim that a payment succeeded that `check-payment-status` didn't confirm this turn. This exists because the model once invented both a reference and a bank account.
- The guest's phone reaches `create-booking` via Mastra `requestContext` (`buildGuestContext`), never as a tool input.
- `create-booking` is two calls. The first returns `needsConfirmation` + `readBack` and books nothing; the same details from the same guest in a LATER turn (a new `turnId`, generated per `buildGuestContext`) make the booking. This is `ConfirmationGate` (`packages/ai/src/confirmation.ts`) — prompt rules alone let the agent book before the guest confirmed. Tests must call it twice with different turn ids.
- Payments (see the Payments section above): `request-payment` sends a real Ecocash/OneMoney charge and stamps `paymentRequestedAt`; `check-payment-status` is the only thing that can report it paid.
- A guest's own hold is theirs: `check-availability` lists it under `alreadyBookedByThisGuest`, and `create-booking` for the exact same room and nights returns the existing booking before the confirmation gate (found live: the agent called its own freshly booked room "not available" and tried to book again). `look-up-booking` gives the guest's name only to the phone that booked.
- `groundReply` also blocks: a claim that a charge/PIN prompt was sent unless request-payment sent one (or check-payment-status asked) this turn — the fallback then relays the tool's own reason; and, when `siteOrigin` is passed (both call sites do), any link that is not `/book`, `/policies` or `/pay/<reference>` (no query strings). Digits the guest typed that turn (their mobile money number) are not "payment details".
- Tests: `pnpm --filter agent test` is hermetic (deletes the OpenRouter key, never launches a browser). `pnpm --filter agent test:e2e` talks to the real model and costs tokens; it lives in `e2e/` because bun runs every loaded test file in one process.
