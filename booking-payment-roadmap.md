# Forest Creek Booking and Payment Implementation Roadmap

This roadmap converts the booking and payment requirements in [`improvements.md`](./improvements.md) into specific action items, technical tasks, dependencies, and release gates. It is ordered to protect the core business flow: **availability → reservation hold → payment → confirmation → administration**.

## Outcome

Forest Creek should have one reliable flow in which guests can see accurate room availability, select optional activities, submit a reservation, pay through a Zimbabwean or international method, and receive a confirmation. Authorized staff must be able to view, cancel, correct, and reconcile bookings without editing the database manually.

The implementation should treat the server and payment provider callbacks as authoritative. The browser must never be trusted to determine availability, booking status, or the amount paid.

The client has confirmed that the application already has a backend admin system for uploading properties and rooms. The roadmap therefore does not treat collecting room names as a prerequisite. Before asking the client for data that may already exist, inspect the admin screens, database schema, API procedures, and payment package. Amenities per property are planned for a later pass and should not block the current booking flow unless the existing code already requires them.

## Implementation status (updated 23 September 2026)

Done in code, with tests (see `AGENTS.md` for how each piece works):

| ID | Status | Where |
|---|---|---|
| BKG-03 | Done: room row lock (`lockRoom`) around check-and-claim; concurrency test proves 1 of 6 simultaneous requests wins. | `packages/db/src/bookings.ts` |
| BKG-04 / PAY-06 | Done: 30-minute holds, request-time expiry, sweeper, lapsed-hold revival re-checks the room. | `hold-policy.ts`, `payments.ts`, `apps/server/src/hold-sweeper.ts` |
| BKG-05 / PAY-07 | Done: booking wizard and `/pay/[reference]` with EcoCash, OneMoney, InnBucks, Visa. | `apps/web` |
| BKG-06 | Done: server-side room + activity pricing, snapshotted on the booking. | `createBooking` |
| BKG-07 | Done: availability calendar, cancel/release, room blocks with reason and author. | `/dashboard/availability` |
| BKG-09 | Done: email outbox for created / confirmed / cancelled / expired / review, SMTP delivery with retries, per-booking log and retry in the dashboard. Needs `SMTP_*` set in Coolify to actually send. | `notifications.ts`, `packages/mail` |
| PAY-03 | Done: amount always from the stored booking; the browser never sends one. | `payments.ts` |
| PAY-04 / PAY-05 | Done: `POST /paynow/result` verifies the hash, matches poll URL and amount, idempotent. Verified live with forged, genuine and replayed callbacks. | `apps/server/src/paynow-result.ts` |
| PAY-09 | Done: per-booking Paynow status/reference, "Re-check with Paynow", review notes for late or mismatched payments. | `booking-activity.tsx` |
| PAY-10 | Done as a manual workflow (Paynow has no refund API): cancelling a paid booking marks a refund due; staff record "refunded" with the reference or "declined" with the policy reason; the guest is emailed. Needs the client's cancellation policy (BKG-01) to decide which applies. | `recordRefund`, `refund-panel.tsx` |
| PAY-11 | Done except one deliberate exception: rate limits on public payment procedures, secrets only in env, staff writes scoped by property, error logs via `describeError`, query strings dropped from request logs, and the Paynow SDK patched so it stops logging guests' emails and phone numbers. The WhatsApp agent still logs inbound messages verbatim, on purpose, for delivery debugging. HTTPS is Coolify's and should be checked on the live domain. | `log.ts`, `request-log.ts`, `patches/` |
| Phase 5 monitoring | Done: every Paynow callback and notable poll is logged per booking; the dashboard's "Needs attention" panel and tab show stuck charges, review cases, refunds due, failed emails, Paynow errors, forged callbacks and missing Paynow/SMTP config. Nothing pages anyone out of hours yet. | `alerts.ts`, `attention-panel.tsx` |

Still open:

- **PAY-01 / PAY-08**: Paynow account, live credentials and Visa coverage are external; set `PAYNOW_INTEGRATION_ID/KEY` and `SERVER_URL` in Coolify, then run a sandbox payment per method.
- **BKG-01 / section 5 decisions**: deposit vs full payment, cancellation and no-show policy, and staff approval vs auto-confirm still need the client.
- **Out-of-hours alerting**: the attention panel only helps when someone opens the dashboard. An email or WhatsApp digest to the owner could follow.
- **Image tagging (improvements.md, P2)**: probably not a feature. In the chat, "tagging the pictures / second tag" came right before "Where should this one be used Sir" / "our story" — the client was quoting (tagging) photos in WhatsApp to say where each goes, and those placements are live. Confirm with the client before building anything.

## Priority definitions

- **P0 — Launch-blocking:** required for a reliable public booking and payment flow.
- **P1 — Important operational capability:** required for efficient day-to-day administration or broader payment coverage.
- **P2 — Enhancement:** useful after the core flow is stable.

## 1. Specific action items and technical tasks

### Booking module

| ID | Priority | Action item | Technical tasks | Completion evidence |
|---|---|---|---|---|
| BKG-01 | P0 | Define the remaining booking rules before coding | Confirm check-in and check-out semantics, timezone, minimum/maximum stay, number of guests, deposit versus full payment, price validity, cancellation policy, payment expiry, and whether activities are booked per reservation or per room. Do not request room names until the existing admin/database data has been inspected. Record the decisions as a versioned contract. | Product owner and Forest Creek team approve the written rules; no implementation assumption remains unresolved. |
| BKG-02 | P0 | Verify and extend the existing property/room model | Inspect the current backend admin, Prisma models, API procedures, and room/property upload flow. Reuse the existing property and room records. Add only the missing entities for availability blocks, activities, reservation records, reservation items, guests, and audit events. Store booking status separately from payment status. | The implementation uses the existing property/room data without duplicate content-entry work, and any migration can create the missing schema from an empty database. |
| BKG-03 | P0 | Prevent double bookings | Implement a server-side availability service. Check conflicts inside a database transaction. For PostgreSQL, use a date/range overlap constraint or an equivalent locking strategy for active holds and confirmed bookings. Exclude cancelled, expired, and released records from conflict checks. | Two concurrent booking attempts for the same room and dates cannot both become active reservations. |
| BKG-04 | P0 | Add temporary reservation holds | Create a `pending_payment` reservation with an expiry time before redirecting the guest to payment. Prevent other guests from taking the held dates until the hold expires or is cancelled. Add a cleanup job or request-time expiry handling. | An abandoned checkout releases its dates automatically and a second guest can book them after expiry. |
| BKG-05 | P0 | Build the public availability and booking flow | Add date selection, guest count, available-room results, room details, multi-image gallery, activity selection, price summary, guest details, validation, and a clear checkout action. Recalculate availability and price on the server when the form is submitted. | A guest can complete the flow on mobile and desktop without selecting an unavailable room or receiving a stale price. |
| BKG-06 | P0 | Calculate the booking total on the server | Implement one pricing function for room charges, activity charges, discounts if approved, taxes/fees if applicable, deposit amount, and total amount. Return a line-item breakdown to the UI and persist the calculated snapshot on the reservation. | The amount shown at checkout matches the amount sent to the payment provider and the stored reservation snapshot. |
| BKG-07 | P0 | Give administrators control of availability | Add an admin calendar showing rooms, occupied dates, pending holds, and confirmed bookings. Allow authorized staff to block dates, cancel bookings, release dates, and correct stale records. Record who made each change and why. | An administrator can resolve a false “occupied” date without database access, and the public calendar updates immediately. |
| BKG-08 | P1 | Synchronize booking state across connected systems | Define the booking event contract for the website, mobile app, AI agent, and shared database. Expose only the required API operations and ensure all consumers read the same reservation and payment status. | A booking created or cancelled in one authorized channel produces the same state in every connected channel. |
| BKG-09 | P0 | Send booking notifications | Send a reservation-created, payment-pending, payment-confirmed, payment-failed, cancellation, and expiry message where applicable. Route reservation/admin notifications to the approved address. Use a queue or retry mechanism so a temporary mail failure does not corrupt booking state. | Each state change has an auditable notification result and failed delivery can be retried. |

### Payment module

| ID | Priority | Action item | Technical tasks | Completion evidence |
|---|---|---|---|---|
| PAY-01 | P0 | Confirm Paynow account and method configuration | Confirm the Forest Creek Paynow account, merchant credentials, supported currencies, sandbox/live access, callback requirements, settlement account, refund capabilities, and whether Visa is enabled for the intended international guests. The confirmed methods are EcoCash, OneMoney, InnBucks, and Visa, all through Paynow. | Paynow account and credentials are available in the correct environments, all four methods are confirmed in the provider configuration, and any currency or Visa limitation is documented. |
| PAY-02 | P0 | Define a payment state machine | Implement explicit states such as `unpaid`, `pending`, `paid`, `failed`, `expired`, `cancelled`, `partially_refunded`, and `refunded` as required. Keep payment status separate from reservation status. Define allowed transitions and reject invalid transitions. | Every testable payment scenario maps to one documented state transition. |
| PAY-03 | P0 | Create payments from the server | Add a server endpoint that accepts a reservation identifier, verifies ownership and availability, recalculates the amount, creates a provider payment request, and stores the provider transaction/reference ID. Never accept the final amount or paid status from the browser. | Tampering with the client amount does not change the amount charged or stored. |
| PAY-04 | P0 | Integrate Paynow callbacks/webhooks | Implement the Paynow return/callback flow required by the account. Verify the provider response, signature/hash, transaction reference, amount, currency, and reservation association. Update the payment and reservation transactionally. | A valid provider confirmation changes the reservation to paid/confirmed; an invalid or mismatched callback is rejected and logged. |
| PAY-05 | P0 | Make callbacks idempotent | Store every callback/event ID and provider reference. Process a duplicate callback as a no-op after the first successful update. Protect against retries, browser refreshes, network timeouts, and duplicated return URLs. | Replaying the same callback never creates a second reservation, second payment, or duplicate confirmation. |
| PAY-06 | P0 | Handle failed, abandoned, and expired payments | Add retry payment, cancel checkout, payment expiry, and hold-release behavior. Keep a failed attempt available for audit without marking the reservation paid. Ensure an expired hold cannot be confirmed later unless a new valid hold is created. | Failed and abandoned checkouts end in predictable states and release dates according to the agreed rules. |
| PAY-07 | P0 | Show confirmed Paynow methods clearly | Present EcoCash, OneMoney, InnBucks, and Visa at checkout as Paynow methods. Explain the payment amount, currency, pending status, and what the guest should do after returning from the provider. | A Zimbabwean guest can identify the local methods, and an international guest can identify whether Visa is available for the selected currency/country. |
| PAY-08 | P0 | Verify Paynow Visa coverage for international guests | Configure and test Visa through Paynow before introducing another provider. Add any required country, currency, 3-D Secure, provider-error, and settlement handling. Only create a separate provider adapter if Paynow cannot meet the approved international-payment requirement. | A Visa test payment completes through Paynow, or the client receives a documented limitation and approves the next provider decision. |
| PAY-09 | P1 | Add payment reconciliation tools | Add an admin view for reservation ID, provider reference, amount, currency, status, timestamps, and last provider response. Provide a safe way to retry reconciliation or mark a case for manual review without allowing staff to fabricate a paid result. | Staff can investigate a payment that succeeded at the provider but was interrupted before the application received the callback. |
| PAY-10 | P1 | Add refunds and cancellations if supported | Map the agreed cancellation policy to payment behavior. Integrate provider refunds where supported; otherwise create a manual-review workflow with a recorded refund decision and reference. | A cancelled booking has a visible refund outcome and audit record. |
| PAY-11 | P0 | Protect payment and guest data | Keep provider secrets in environment/configuration storage, never in the repository or client bundle. Validate and rate-limit payment endpoints, redact sensitive provider responses from logs, authorize admin actions, and use HTTPS in every environment. | Security review finds no exposed credentials, unauthenticated admin mutation, or sensitive payment data in normal logs. |

## 2. Recommended implementation phases

### Phase 0 — Decisions, contracts, and provider readiness

**Priority: P0. This phase gates all coding.**

1. Inspect the current admin and codebase first, then approve only the remaining booking rules from BKG-01, including date semantics, cancellation, hold duration, deposit/full payment, guest fields, activity pricing, and timezone.
2. Confirm whether `admin@forestcreek.co.zw` is the reservation destination or whether `reservations@forestcreek.co.zw` remains the public booking inbox. Use one consistent routing rule in the application.
3. Confirm the Paynow account, sandbox access, supported currency, callback method, production credentials process, and whether Visa is enabled for the intended international guests.
4. Confirm that EcoCash, OneMoney, InnBucks, and Visa are the complete launch payment-method list, all processed through Paynow.
5. Define the reservation and payment status machines, API contracts, error format, notification events, and audit requirements.
6. Create separate development, staging, and production configuration entries. Do not commit provider credentials.

**Exit gate:** all business and provider decisions are documented, credentials can be injected securely, and the team has approved the API/state contracts.

### Phase 1 — Availability and reservation foundation

**Priority: P0. Build before any payment UI.**

1. Implement the migrations and data model in BKG-02.
2. Implement BKG-03 conflict prevention and BKG-04 temporary holds.
3. Implement BKG-06 server-side pricing snapshots.
4. Add automated tests for overlapping dates, concurrent requests, hold expiry, cancellations, free activities, paid activities, and stale availability.
5. Build the first admin calendar and date-control functions from BKG-07.

**Exit gate:** the system can create, hold, confirm-for-testing, cancel, and release a reservation without double-booking a room.

### Phase 2 — Guest booking experience

**Priority: P0. Build on the tested foundation.**

1. Implement BKG-05: dates, room results, room details, multi-image gallery, activities, guest details, price breakdown, and checkout.
2. Add server-side revalidation immediately before creating the pending reservation.
3. Add mobile and desktop validation for date pickers, summaries, forms, error states, and accessibility.
4. Implement BKG-09 notification templates for pending reservations and administrative alerts.
5. Connect the approved reservation email routing.

**Exit gate:** a test guest can submit a valid booking request on mobile and desktop, and the system creates one expiring `pending_payment` reservation with the correct server-calculated amount.

### Phase 3 — Paynow integration and local payment launch

**Priority: P0.**

1. Implement PAY-02 and PAY-03 payment creation from the server.
2. Implement the Paynow return/callback integration in PAY-04.
3. Add PAY-05 idempotency before enabling real payment testing.
4. Implement PAY-06 failure, expiry, retry, and hold-release behavior.
5. Build the checkout method selection and payment-status screens from PAY-07.
6. Send confirmed, failed, expired, and cancelled notifications.
7. Test with provider sandbox scenarios before using production credentials.

**Exit gate:** a successful Paynow payment confirms exactly one reservation; failed, cancelled, expired, duplicated, delayed, and mismatched callbacks do not incorrectly confirm a reservation.

### Phase 4 — Paynow method coverage and Visa verification

**Priority: P0 if international guests are part of launch; otherwise P1 immediately after the local pilot.**

1. Configure and expose EcoCash, OneMoney, InnBucks, and Visa through the existing Paynow integration.
2. Verify Paynow’s supported country, currency, Visa, and any 3-D Secure requirements.
3. Add country, currency, and method availability rules without duplicating booking logic.
4. Map Paynow-specific errors and asynchronous confirmations into the shared payment state machine.
5. Test successful payment, decline, timeout, duplicate callback, refund, and currency/amount mismatch scenarios for both local methods and Visa.
6. Add a separate provider adapter only if Paynow cannot meet the approved international-payment requirement.

**Exit gate:** each approved method produces the same reservation and notification behavior, with an auditable Paynow reference and currency; any Visa limitation has been explicitly accepted by the client.

### Phase 5 — Operations, reconciliation, and connected-system readiness

**Priority: P0/P1. Complete before broad public use.**

1. Finish the administrator calendar, cancellation, release, and audit functions.
2. Add payment reconciliation and manual-review tools from PAY-09.
3. Add refund/cancellation handling from PAY-10 if supported by the approved provider and policy.
4. Implement BKG-08 synchronization contracts for the website, mobile app, AI agent, and shared database.
5. Connect the dedicated WhatsApp agent number and ensure the agent can report reservation/payment status without exposing privileged operations.
6. Add monitoring for failed callbacks, stuck pending payments, expired holds, email failures, and provider outages.

**Exit gate:** staff can operate the booking system for a full test day without database edits, and all connected channels show consistent reservation/payment status.

### Phase 6 — Hardening and production launch

**Priority: P0.**

1. Run end-to-end tests on iOS, Android, and desktop browsers.
2. Test concurrent booking attempts for the same room and date range.
3. Replay callbacks and simulate delayed, duplicated, malformed, and out-of-order provider responses.
4. Verify HTTPS, domain routing, database backups, secret injection, access control, rate limits, and log redaction.
5. Verify reservation emails, payment emails, admin alerts, and the final email destination.
6. Test cancellation and date release from the admin interface.
7. Run a staging-to-production deployment rehearsal and record the rollback procedure.
8. Perform a controlled pilot with Forest Creek staff before public launch.

**Exit gate:** every launch acceptance criterion below passes, the Forest Creek team signs off on the pilot, and rollback/incident contacts are known.

## 3. Dependencies and delivery order

The following dependencies should be treated as hard gates:

1. **Booking rules precede schema design.** Without cancellation, hold, pricing, and date rules, the database cannot model correct behavior.
2. **Availability protection precedes payment.** Payment must never be allowed to confirm an unprotected or already-booked date.
3. **Server pricing precedes provider integration.** The provider request must be generated from a trusted reservation calculation.
4. **Provider onboarding precedes payment launch.** Paynow credentials and the international provider decision are external dependencies.
5. **Idempotency precedes real-money testing.** Duplicate callbacks and browser retries must be safe before production credentials are used.
6. **Admin correction tools precede public launch.** Staff must be able to cancel, release, and investigate reservations without direct database changes.
7. **Email routing precedes acceptance testing.** A successful payment without a reliable reservation notification is not a complete booking.

## 4. Launch acceptance checklist

### Booking

- A room cannot have two active reservations for overlapping dates.
- An expired or cancelled reservation releases its dates.
- The administrator can block dates, cancel a booking, and release dates from the back office.
- The public availability view reflects admin changes without a manual database edit.
- Room charges and activity charges are calculated on the server and shown as line items.
- Free activities can be selected without creating an invalid payment amount.
- A guest can complete the booking form on mobile and desktop.

### Payment

- Paynow payment creation uses a server-calculated amount and approved currency.
- A valid provider confirmation changes the payment and reservation exactly once.
- Invalid, mismatched, duplicate, delayed, and replayed callbacks are safely handled.
- Failed and abandoned payments do not mark a reservation as paid.
- Payment expiry releases the temporary reservation hold according to the agreed rule.
- The checkout clearly distinguishes pending payment from confirmed booking.
- The selected international method works if international booking is included in launch scope.
- Payment and reservation emails are delivered to the approved addresses.

### Security and operations

- No payment secret is present in source control or browser JavaScript.
- Admin mutation endpoints require authentication and authorization.
- Sensitive payment data is not written to ordinary application logs.
- Provider outages and callback failures are visible to administrators.
- A backup and rollback procedure has been tested.
- Website, mobile app, AI agent, and database report consistent states.

## 5. Open decisions to resolve before Phase 1

1. What currency or currencies should be displayed and charged, and does Paynow support the required Visa settlement flow for those currencies?
2. Is the guest required to pay the full amount or a deposit to confirm a reservation?
3. How long should an unpaid reservation hold dates before it expires?
4. What are the cancellation, refund, and no-show rules?
5. Which activities are free, which have an additional charge, and how are activity quantities handled? Inspect the existing admin/codebase first to see which fields already exist.
6. Should bookings be approved automatically after verified payment, or reviewed by staff first?
7. Which email address is the single source of truth for reservations: `admin@forestcreek.co.zw` or `reservations@forestcreek.co.zw`?
8. Should the WhatsApp agent be allowed only to read booking status, or also to create/cancel reservations through authorized APIs?

Questions about room names, property records, current room prices, and existing upload fields should be answered by scanning the current admin system and codebase before asking the client again. The next client message should focus on business rules and provider/account decisions that the code cannot determine.

## References

[1]: ./improvements.md "Forest Creek consolidated website improvements"
[2]: file:///home/ubuntu/upload/WhatsAppChatwithMrChikono.txt "WhatsApp chat export with Mr Chikono"
