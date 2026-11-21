# Digital Cheques for Ghana — Implementation Spec (v1)
Send money with a name and a WhatsApp number. The recipient verifies, then chooses where it lands.

This builds on your concept doc. It keeps your architecture and adds: the missing funding model, hardened claim security, complete sender and recipient flows, failure handling, data model, APIs, and a phased plan.

## 1. Gaps in the original concept (decide these first)
| # | Gap | Recommendation |
|---|---|---|
| 1 | How does a Ghanaian sender fund the cheque? The doc says "USDC", but most senders hold MoMo, not USDC. | Primary: fund with MoMo (via the MoraPay payout integration, Phase 2). Secondary: fund with USDC. Sender still sees only "Pay ₵505". |
| 2 | Who bears FX/fee? | Cheque face value is fixed in GHS. Sender pays fee on top; recipient gets the full ₵500 (MoMo network fees aside). Lock the USDC quote at funding time and add a small buffer. |
| 3 | Link is guessable (CHQ-82F91K is short). | Use two identifiers: public human code (CHQ-82F91K, display only) and a 128-bit random claim token in the URL. |
| 4 | Forwarded link / wrong number / SIM swap. | OTP is necessary but not sufficient. Add attempt limits, an informational name-match warning on payout, amount-based step-up, and sender-visible alerts (section 5). |
| 5 | Whose KYC does SEP-12 need? Anchors usually KYC the customer (the recipient) at some threshold. | Confirm limits/tiers with MoraPay and legal. Design a "KYC required" step in the claim flow that only appears above the threshold. |
| 6 | Bank payout is unproven. MoMo payout rails are well documented; bank payout availability varies by provider. | V1 = MoMo + USDC. Bank is Phase 2 behind a feature flag. |
| 7 | Regulation. Holding customer funds and paying out in GHS is regulated (Bank of Ghana). | Get legal advice early; likely operate under a licensed partner. Affects custody and limits, so settle it before launch. |
| 8 | Terminal FAILED while money is in flight is dangerous. | Payout failures are retryable and loop back to AUTHORIZED; funds stay locked (section 6). |

## 2. Product principles
- The user sees a cheque, never Stellar, USDC, or SEPs.
- Sender answers who; recipient answers where.
- Money is locked at funding and can leave only once.
- Every state change is logged and reversible by refund, never silently lost.
- The payout provider is replaceable (adapter pattern; MoraPay planned for Ghana MoMo/bank payouts).

## 3. Cheque lifecycle
```
[DRAFT]
  │ (sender confirms)
  ▼
[PENDING_FUNDING] ──(sender cancels / timeout)──► [CANCELLED]
  │ (funds confirmed + quote locked)
  ▼
[ACTIVE] ─────────(sender cancels)──────────────► [REFUNDING] ──► [REFUNDED] / [REFUND_REVIEW]
  │                                                     ▲
  ├───────────────(TTL reached)─────────────────────────┤
  │ (recipient opens + requests OTP)
  ▼
[CLAIMING] ───────(session expired + TTL passed)────────┤
  │ (OTP verified)
  ▼
[AUTHORIZED] ◄────(payout failed - retryable)──┐
  │ (destination confirmed)                    │
  ▼                                            │
[SETTLING] ────────────────────────────────────┘
  │ (payout confirmed)
  ▼
[SETTLED]
```

Mapping to your original names: FUNDED + ISSUED are merged into ACTIVE (a funded cheque is immediately live). FAILED becomes REFUND_REVIEW (manual ops queue) so money is never stranded.

### Rules
- Sender can cancel only in PENDING_FUNDING or ACTIVE. Once CLAIMING begins, cancel is blocked (prevents race abuse).
- Expiry never fires on AUTHORIZED or SETTLING. An authorized claim gets a 30-minute payout window; if unused, it falls back to ACTIVE until TTL.
- Expiry presets: 24h, 48h (default), 7 days. Max 30 days.

## 4. Sender flow
### 4.1 Onboarding (first time, under 60 seconds)
- Enter own phone number → OTP (WhatsApp, SMS fallback).
- Name + optional PIN or biometric for later actions.
- Land directly on Create cheque (no empty dashboard).

### 4.2 Create cheque
- Recipient: name + WhatsApp number (Ghana-formatted, validated as +233, with a "Is this correct? +233 24 XXX 1234" confirm line that shows the number in large text). Optional contact picker.
- Amount: GHS, with min/max shown (suggest ₵5 min; start cap ₵2,000 for V1).
- Note (optional): "For rent", max 80 chars. Shown to recipient.
- Expiry: chips (24h / 48h / 7d).
- Review screen: recipient, amount, fee line, total to pay, expiry, and refund policy ("If unclaimed, you're refunded to MoMo").

### 4.3 Fund
- Pay with MoMo (default): push a MoMo prompt to the sender's number. Show a waiting screen with a countdown and "Check status". Timeout after 10 min → CANCELLED.
- Pay with USDC: show a Stellar address + memo + exact amount, with an auto-detect spinner.
- On confirmed funding → quote locked → cheque ACTIVE → success screen.

### 4.4 Share
Success screen is the key moment:
- Primary button: "Send on WhatsApp" (opens `wa.me/233…?text=` prefilled with the link, sent from the sender's own WhatsApp).
- Secondary: copy link, share sheet, QR code.
- Also the platform sends the recipient a WhatsApp template message (opt-in notification) so they get it even if the sender forgets to forward. Configurable per cheque.
- Prefilled text: "Kojo, I've sent you a ₵500 cheque. Open to claim: https://cheq.app/c/<token>"

### 4.5 Track
- Cheque detail page with a plain timeline: Created → Paid → Shared → Opened → Verified → Paid out
- Push/WhatsApp notifications to sender on: opened, verified, paid out, 12h before expiry, expired and refunded.
- Actions: Resend link, Cancel & refund (when allowed), Extend expiry (once, if ACTIVE).
- Receipt: downloadable/shareable proof ("₵500 delivered to MTN ••• 4821").

### 4.6 Sender safety
- First-time recipient + amount above ₵500 → extra confirm screen: "Only send to people you know. Cheques can't be reversed after they're claimed."
- Daily and monthly sender limits; velocity checks.

## 5. Recipient flow
### 5.1 Landing (no app, no login, mobile web)
- Before verification show only: sender first name, amount, note, expiry. Mask the payee ("Payable to K**** M*****"). Show brand + trust cues ("Paid out to Mobile Money in minutes").
- States handled with clear screens: Active, Expired, Cancelled, Already claimed, Invalid link.

### 5.2 Verify
- "Send code to WhatsApp +233 24 XXX 4821" → one tap.
- 6-digit OTP, 5-min expiry, max 5 attempts, resend after 30s (max 3), SMS fallback.
- Success → short-lived claim session (signed, 30 min, bound to cheque + device fingerprint).

### 5.3 Choose destination
Cards in this order: Mobile Money (default, preselected), USDC; Bank appears in Phase 2.

#### Mobile Money
- Network (MTN / Telecel / AirtelTigo), number, prefilled with WhatsApp number but editable.
- Account-name lookup (MoraPay supports it via /rails/resolve): show the registered name and compare to the cheque payee name. The lookup is informational, never blocking: the recipient may send to a number registered to a different name. On mismatch show the registered name, a clear warning, and require an explicit "Yes, this is my number" confirmation. Log the result for fraud analytics.

#### USDC
- Paste Stellar address. Validate checksum (G… 56 chars), and check the account exists and has a USDC trustline; if not, explain simply ("This wallet can't receive USDC yet") and offer MoMo instead. Support memo field for exchange deposits.
- QR scan of address as convenience.

### 5.4 Confirm and send
- Summary: amount, destination, estimated time, any fee. Button "Get my ₵500". Idempotency key is generated on this screen so double taps are harmless.

### 5.5 Progress and receipt
- Live status: Verifying → Sending → Delivered. Page survives refresh and reopens to the same state.
- Receipt with reference ID, and WhatsApp message confirming delivery.
- If delayed: "Taking longer than usual. Your money is safe." with support link.
- Growth hook: "Send your own cheque" CTA after success.

### 5.6 Recipient failure paths
| Failure | UX |
|---|---|
| OTP never arrives | Switch to SMS; support link |
| Wrong MoMo number / payout rejected | Return to destination screen, funds still locked, "Try another number" |
| KYC required | Inline short form (SEP-12 data), then continue |
| Link opened on wrong phone | OTP goes only to the bound number, so it fails safely |
| Session expired | Re-verify; cheque stays ACTIVE |

## 6. Backend engineering rules
### 6.1 Single redemption (the critical guarantee)
- Atomic state transition in Postgres: `UPDATE cheques SET state='SETTLING', ... WHERE id=$1 AND state='AUTHORIZED' RETURNING *` — zero rows means someone else got there first.
- Unique constraint on `payouts(cheque_id) WHERE status IN ('PENDING','SENT','CONFIRMED')`, so only one live payout per cheque exists.
- Idempotency keys on every mutating endpoint (stored with the response).
- Webhook dedupe: store provider event IDs with a unique index; processing is idempotent.
- Outbox pattern: DB transaction writes state + an outbox row; a worker calls MoraPay/Stellar. Never call external APIs inside the DB transaction.
- Reconciliation job (every few minutes): compare SETTLING payouts against MoraPay status and Stellar transactions; fix drift automatically or flag.

### 6.2 Ledger
- Use double-entry accounting (immutable entries): sender_funds → cheque_escrow → payout_pending → settled, plus fees and fx_buffer accounts. State and money must always reconcile. Amounts stored as integer minor units (pesewas) and USDC at 7 decimals (stroops), never floats.

### 6.3 Custody model
- V1: pooled Stellar treasury account(s) + internal ledger per cheque. Simple, cheap.
- Option for USDC-native funding: Stellar claimable balances, with claimants for platform and sender (refund after time predicate). Good fit later; adds on-chain transparency.
- Keys in HSM/KMS, hot wallet limited to a small float, multi-sig on treasury.

### 6.4 Quoting
- At funding: SEP-38 quote (GHS→USDC), store quote_id, rate, expiry, buffer.
- At settlement: if the locked quote is expired, re-quote; any shortfall comes from the FX buffer account (company risk), never from the recipient.
- Always log rate used per cheque.

### 6.5 Settlement adapter interface
```typescript
interface SettlementAdapter {
  quote(cheque: Cheque): Promise<Quote>;
  fund(cheque: Cheque): Promise<FundingRef>;
  settle(cheque: Cheque, destination: Destination, idempotencyKey: string): Promise<PayoutRef>;
  status(payoutRef: string): Promise<PayoutStatus>; // PENDING | SUCCESS | FAILED(reason, retryable)
  refund(cheque: Cheque): Promise<RefundRef>;
}
```
- Implementations: MoraPayAdapter (REST API + webhook integration behind the SettlementAdapter interface) and StellarUsdcAdapter (direct USDC send). Add a MockAdapter for dev and tests.

### 6.6 Failure semantics
- Retryable failure (network, provider timeout): auto-retry with backoff, same idempotency key, stay SETTLING.
- Definitive failure (invalid number): → AUTHORIZED, notify recipient to pick another destination.
- Repeated failure past N attempts or 24h: → REFUND_REVIEW.
- Never mark SETTLED until provider confirms final success.

## 7. Security and abuse controls
- Claim token 128-bit random, hashed at rest; rate limit by IP, token, and phone.
- OTP via WhatsApp Authentication template; store hashed; constant-time compare; per-number send caps.
- Payout destination lock: after OTP, destination changes require re-verification; changing destination within a session is logged.
- Step-up for higher amounts: extra confirmation, optional delay (e.g., 15 min hold with sender alert) over a threshold.
- Sender alert at claim: "Kojo verified and requested payout to MTN ••• 4821".
- Sanctions/fraud screening on sender, recipient number, and Stellar address.
- Audit log is append-only; all admin actions require two-person approval for refunds over a limit.
- Privacy: minimal PII; mask numbers in UI and logs; retention policy; Ghana Data Protection Act consent and notice at signup.

## 8. WhatsApp integration
- Use WhatsApp Business Cloud API. Required templates (pre-approved): `cheque_received`, `otp` (Authentication category), `cheque_claimed`, `cheque_expiring`, `payout_delivered`.
- Get explicit opt-in for platform-sent messages; the sender-initiated `wa.me` share is from the sender's own WhatsApp, so it needs no template.
- Plan for template approval time (days) and per-message costs in the pricing model.
- SMS fallback provider for OTP delivery failures.

## 9. Data model (Postgres)
- `users(id, phone, name, status, kyc_level, created_at)`
- `cheques(id, public_code, claim_token_hash, sender_id, payee_name, payee_phone_e164, face_amount_minor, fee_minor, note, state, expires_at, quote_id, usdc_amount_stroops, fx_rate, version, created_at, updated_at)`
- `funding(id, cheque_id, method, status, provider_ref, amount, created_at)`
- `claim_sessions(id, cheque_id, otp_hash, attempts, verified_at, expires_at, device_fp)`
- `destinations(id, cheque_id, type, network, account_ref, account_name, verified_name_match)`
- `payouts(id, cheque_id, destination_id, status, provider_ref, idempotency_key, attempts, last_error, created_at)` — partial unique index (see 6.1)
- `refunds(id, cheque_id, method, status, provider_ref)`
- `ledger_entries(id, tx_id, account, debit, credit, cheque_id, created_at)`
- `events(id, cheque_id, type, actor, payload, created_at)` — audit log
- `webhook_events(provider, event_id UNIQUE, payload, processed_at)`
- `outbox(id, topic, payload, status, attempts, next_run_at)`
- `idempotency_keys(key, request_hash, response, created_at)`

## 10. API surface
### Sender (authenticated)
- `POST /v1/cheques` create draft + review totals
- `POST /v1/cheques/:id/fund` choose method, start funding
- `GET /v1/cheques/:id` status + timeline
- `POST /v1/cheques/:id/cancel`
- `POST /v1/cheques/:id/resend`
- `GET /v1/cheques` history

### Recipient (public + claim session)
- `GET /v1/claim/:token` masked preview
- `POST /v1/claim/:token/otp` send code
- `POST /v1/claim/:token/verify` → claim session
- `POST /v1/claim/destinations/validate` (MoMo name lookup / Stellar address + trustline check)
- `POST /v1/claim/:token/redeem` (idempotency-key required)
- `GET /v1/claim/:token/status` poll/SSE

### Webhooks & Background
- Webhooks in: settlement-provider transaction updates, Stellar payment detection, MoMo collection callbacks.
- Background jobs: expiry sweeper, refund processor, outbox worker, reconciler, quote refresher, notification scheduler.

## 11. Observability and ops
- Metrics: funnel (created → funded → shared → opened → verified → settled), time-to-payout, OTP success rate, payout failure rate by reason, refund rate, FX buffer P&L.
- Alerts: stuck SETTLING > 15 min, reconciliation drift, treasury balance low, webhook failures, OTP provider outage.
- Admin console: search by code/phone, timeline view, retry payout, force refund (dual approval), blocklist.

## 12. Suggested stack
- TypeScript (Node 20, Fastify), Postgres (Drizzle or Prisma + SQL migrations), Redis, BullMQ, Zod, Vitest, Stellar JS SDK, Next.js (App Router, Tailwind) for the web app, pnpm monorepo.
