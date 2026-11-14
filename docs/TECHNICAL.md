# Technical documentation

This document describes how sencheq is built: components, data flow, the cheque lifecycle, the API, the data model, security controls and how to operate it. For product intent see [SPEC.md](SPEC.md). For the contract's full storage and access rules see [CONTRACT.md](CONTRACT.md).

## 1. Architecture

```
            ┌──────────────┐        ┌─────────────────────────┐
  sender ──▶│  web (Next)  │──REST─▶│   api (Fastify)         │
 recipient─▶│  /app /c/:t  │        │   cheque-service        │
            └──────────────┘        │   auth (OTP, JWT)       │
                                    │   webhooks              │
                                    └──┬────────┬─────────┬───┘
                                       │        │         │
                             ┌─────────▼─┐  ┌───▼────┐  ┌─▼──────────────┐
                             │ Postgres  │  │ Redis  │  │ outbox worker  │
                             │ (state,   │  │ (queue)│  │ (chain ops)    │
                             │ ledger,   │  └────────┘  └──┬─────────────┘
                             │ outbox)   │                 │
                             └───────────┘          ┌──────▼──────────┐
                                                    │ chain (Stellar) │
                                                    │ Soroban escrow  │
                                                    └─────────────────┘
   notify: WhatsApp Cloud API ─▶ SMS fallback (OTP, notifications)
```

The **web app** is a Next.js 14 client app. Money and state live in the **API**. The **database** is the source of truth. Anything that touches the chain goes through the **outbox**, so a crash cannot lose or duplicate an on-chain action. The **contract** holds the escrowed USDC and enforces single redemption.

## 2. Packages

| Package | Responsibility | Key modules |
|---|---|---|
| `@cheque/core` | Domain rules and persistence helpers | `state-machine.ts` (allowed transitions and guards), `transition.ts` (applies transitions), `money.ts` (minor units, FX), `corridors.ts` (country rules), `ledger.ts` (double-entry postings), `outbox.ts` (outbox processor), `token.ts` (claim tokens), `masking.ts` (PII masking), `migrations.ts` (schema) |
| `@cheque/chain` | Stellar and Soroban access | `client.ts` (contract calls), `stellar.ts` (Horizon and RPC), `signer.ts`, `channel-pool.ts` (parallel tx submission), `idempotency.ts`, `errors.ts`, `health.ts`, `cheque-id.ts`, `bindings/` (generated contract bindings) |
| `@cheque/notify` | Phone, OTP and messages | `phone.ts` (E.164 normalisation per country), `otp.ts` (WhatsApp first, SMS fallback), `sms.ts`, `whatsapp.ts`, `auth.ts` (access and refresh tokens) |
| `@cheque/shared` | Config and logging | `env.ts` (validated environment), `logger.ts` |
| `api` | HTTP API and workers | `server.ts` (routes, plugins, startup), `cheque-service.ts` (business endpoints), `outbox-worker.ts` (chain operation handler) |
| `frontend` | Web app | `app/page.tsx` (landing), `app/app/page.tsx` (sender), `app/c/[token]/page.tsx` (claim), `lib/api.ts` (client and formatting), `lib/wallet.tsx` (Stellar wallet), `components/ui.tsx` (cheque and shared UI) |
| `contract/cheque` | Soroban escrow (Rust, `soroban-sdk` 22) | `src/lib.rs` (contract), `src/test.rs` (tests) |

## 3. Cheque lifecycle

### States

| State | Meaning |
|---|---|
| `DRAFT` | Created, not yet funded |
| `PENDING_FUNDING` | Waiting for the deposit to confirm |
| `ACTIVE` | Funded and claimable |
| `CLAIMING` | A recipient has started an OTP session |
| `AUTHORIZED` | Claim verified, payout authorised |
| `SETTLING` | Payout in flight |
| `SETTLED` | Paid out (terminal) |
| `CANCELLED` | Cancelled by the sender before claiming (terminal) |
| `EXPIRED` | Past its expiry and unclaimed |
| `REFUNDING` | Escrow being returned to the sender |
| `REFUNDED` | Returned to the sender (terminal) |
| `REFUND_REVIEW` | A payout or refund failed; needs operator review |

### Allowed transitions

| From | To |
|---|---|
| `DRAFT` | `PENDING_FUNDING`, `CANCELLED` |
| `PENDING_FUNDING` | `ACTIVE`, `CANCELLED` |
| `ACTIVE` | `CLAIMING`, `AUTHORIZED`, `CANCELLED`, `EXPIRED`, `REFUNDING` |
| `CLAIMING` | `AUTHORIZED`, `ACTIVE`, `REFUNDING`, `REFUND_REVIEW` |
| `AUTHORIZED` | `SETTLING`, `ACTIVE`, `REFUND_REVIEW` |
| `SETTLING` | `SETTLED`, `AUTHORIZED`, `REFUND_REVIEW` |
| `EXPIRED` | `REFUNDING`, `REFUND_REVIEW` |
| `REFUNDING` | `REFUNDED`, `REFUND_REVIEW` |
| `REFUND_REVIEW` | `REFUNDED`, `AUTHORIZED`, `REFUNDING` |

### Guards

- **Sender cancel** is allowed only from `PENDING_FUNDING` or `ACTIVE`. Once claiming starts, cancellation is blocked.
- **No expiry during payout.** A cheque in `AUTHORIZED` or `SETTLING` cannot expire or refund directly.
- **Expiry needs time.** `EXPIRED` is allowed only once `now >= expires_at`.

Every transition goes through `transition.ts`, which checks the table and guards and writes an event row.

## 4. Money

- Amounts are stored as exact decimal strings or integer minor units. Floating point is not used for money.
- Corridor currencies: GHS, NGN and USD, each with 2 minor digits.
- On-chain USDC uses 7 decimals (1 USDC = 10,000,000 stroops) as `i128` integers.
- The **face amount** is fixed in the recipient's currency. The sender pays a **fee** on top (`FEE_BPS`, default 100 = 1%).
- The **USDC quote** is computed from the FX rate per corridor (`FX_GHS_PER_USDC`, `FX_NGN_PER_USDC`, `FX_USD_PER_USDC`) and locked at funding time.
- The **ledger** records every movement as balanced double-entry transactions across these accounts: `sender_funds`, `cheque_escrow_onchain`, `payout_pending`, `settled`, `fees`, `fx_buffer`, `refunds_pending`. Each transaction must balance, and the validator rejects any that do not.

### Corridors

| Code | Currency | Limits (per cheque) | Payout methods |
|---|---|---|---|
| GH | GHS | 5 to 2,000 | MOMO (planned), USDC |
| NG | NGN | 2,000 to 1,000,000 | BANK (planned), USDC |
| US | USD | 5 to 2,000 | BANK (planned), USDC |

Enabled corridors come from `ENABLED_CORRIDORS`. Only USDC payouts are live today.

## 5. Claim security

The link is the key, so the design layers controls:

1. **Unguessable token.** The claim URL carries a long random token. The public cheque code (`CHQ-XXXXXX`) is for display only and cannot claim anything.
2. **Phone OTP.** The recipient must verify a one-time code sent to their phone. Codes are salted with `OTP_SALT`. Sends are rate limited per phone number, IP address and device (`otp.ts`).
3. **Authority signature.** The API, acting as claim authority, authorises a verified claim on-chain. The contract checks the signature.
4. **Single redemption.** The contract changes the lock to redeemed before it transfers funds (checks-effects-interactions). A second redeem fails.
5. **Delay and veto.** Cheques at or above `delay_threshold` wait `delay_secs` before redeeming. The guardian can veto during that window and return the cheque to `ACTIVE`.
6. **Expiry refund.** After `expires_at`, anyone can trigger a refund to the sender. Funds are never stranded.
7. **Logs and masking.** Phone numbers and other PII are masked in logs and events (`masking.ts`).

## 6. Authentication

- **Senders and recipients** verify with a phone OTP (`POST /auth/otp/request`, then `POST /auth/otp/verify`). The first verification creates the user and can set a name.
- The API returns an **access token** and a **refresh token** (`POST /auth/refresh`). Refresh tokens are stored hashed. The web app refreshes once transparently on a 401, then signs the user out if that fails.
- **Recipients** do not log in. They get a short-lived claim session for their claim token.
- OTP delivery tries **WhatsApp first** and falls back to **SMS**. The app can request SMS directly.

## 7. API

Base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`). Requests and responses are JSON. Authenticated routes take `Authorization: Bearer <access token>`.

### Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness and dependency checks |
| GET | `/config` | Enabled corridors, limits, fee, and whether wallet funding and settlement are on |
| POST | `/auth/otp/request` | Send a one-time code to a phone number |
| POST | `/auth/otp/verify` | Verify the code and get tokens |
| POST | `/auth/refresh` | Exchange a refresh token for new tokens |
| POST | `/webhooks/whatsapp` | WhatsApp inbound and status webhook |

### Sender (authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Current user |
| POST | `/cheques` | Create a cheque (returns the id and claim URL) |
| GET | `/cheques` | List the sender's cheques |
| GET | `/cheques/:id` | Cheque detail |
| POST | `/cheques/:id/cancel` | Cancel before claiming, off-chain path |
| POST | `/cheques/:id/tx/prepare` | Build the unsigned Soroban transaction (`op`: `create` or `cancel`) |
| POST | `/cheques/:id/tx/submit` | Submit the wallet-signed transaction (`op`, `signedXdr`) |

### Recipient (claim token)

| Method | Path | Purpose |
|---|---|---|
| GET | `/claim/:token` | Public cheque view |
| GET | `/claim/:token/status` | Current state, destination and transaction hash once paid |
| POST | `/claim/:token/redeem` | Choose a destination and start the payout (`destination`, `idempotencyKey`) |

Errors come back as `{ message }` with an HTTP status. The web app shows `message` to the user.

## 8. Data model

Tables created by `packages/core/src/migrations.ts`:

| Table | Holds |
|---|---|
| `users` | Phone, name, role (`sender` or `admin`) |
| `cheques` | Cheque record: payee, corridor, amount, currency, note, signature, state, expiry and public code |
| `fundings` | Deposit records and their status |
| `claim_sessions` | Recipient OTP sessions and expiry |
| `destinations` | Chosen payout destinations (MoMo, bank or USDC address) |
| `payouts` | Payout attempts and their status |
| `refunds` | Refund attempts and their status |
| `ledger_entries` | Double-entry postings |
| `events` | Append-only state change log |
| `webhook_events` | Inbound webhook records for idempotent handling |
| `outbox` | Pending chain and side-effect operations |
| `idempotency_keys` | Keys for safe retries of client requests |
| `chain_txs` | Submitted Stellar transactions and their results |

The API runs migrations on start (`runMigrations`). They are idempotent (`CREATE TABLE IF NOT EXISTS`).

## 9. Outbox and chain operations

Chain writes are never done inline in a request. The service:

1. Writes the state change and an `outbox` row in one database transaction.
2. The outbox processor claims rows in batches (`pollIntervalMs` 1000, `batchSize` 10).
3. The `chain:contract:submit` handler performs the Soroban call (`create_cheque`, `lock`, `redeem`, `cancel`, `refund`).
4. On failure the row is retried. With no handler configured, the item fails rather than recording a fake success.

`chain/idempotency.ts` makes submissions safe to retry, and `channel-pool.ts` lets several transactions submit in parallel from separate channel accounts.

## 10. Contract

The Soroban contract (`contract/cheque/src/lib.rs`) exposes:

- **Setup and roles:** `init`, `set_authority`, `set_guardian`, `set_config`, `pause`, `unpause`, `transfer_admin`, `accept_admin`, `upgrade`
- **Cheque flow:** `create_cheque`, `lock`, `unlock`, `redeem`, `cancel`, `refund`
- **Safety:** `veto` (guardian, during a delay)
- **Reads:** `get_cheque`, `get_lock`, `config`, `admin`, `authority`, `guardian`

Roles: the **admin** configures and upgrades; the **authority** (API backend) authorises verified claims; the **guardian** can veto delayed high-value claims. Two-step admin handover prevents accidental transfer. Full storage layout and rules are in [CONTRACT.md](CONTRACT.md).

## 11. Frontend

- **Routes:** `/` (landing), `/app` (sender dashboard, new cheque, share), `/c/[token]` (claim).
- **Data:** `lib/api.ts` wraps `fetch`, handles token refresh, and maps network failures to a readable message.
- **Wallet:** `lib/wallet.tsx` connects a Stellar wallet through the Stellar Wallets Kit. The sender signs the create and cancel transactions, and the API submits them.
- **Demo mode:** `NEXT_PUBLIC_DEMO=1` serves fake data from `lib/demo.ts` so the UI runs with no backend.
- **Design:** see [DESIGN.md](../DESIGN.md). The cheque is always drawn in landscape by `ChequePaper`.

## 12. Configuration reference

Full list in `.env.example`. Required for a working testnet run:

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | api | Postgres connection |
| `REDIS_URL` | api, worker | Queue |
| `STELLAR_NETWORK`, `STELLAR_NETWORK_PASSPHRASE` | chain | Use the testnet passphrase for testnet |
| `STELLAR_HORIZON_URL`, `STELLAR_SOROBAN_RPC_URL` | chain | Network endpoints |
| `USDC_ISSUER_ADDRESS`, `USDC_ASSET_CODE` | chain | Testnet USDC issuer |
| `CHEQUE_CONTRACT_ID` | chain | Set after deploy |
| `*_PUBLIC`, `*_SECRET` account keys | chain | Created by `pnpm bootstrap:testnet`. Keep secrets out of git |
| `JWT_SECRET`, `OTP_SALT` | api | Must be changed for any shared environment |
| `FEE_BPS`, `FX_*`, `ENABLED_CORRIDORS` | api | Pricing and corridors |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` | frontend | Where the web app finds the API and itself |

## 13. Local development

| Service | Port |
|---|---|
| API | 3001 |
| Web | 3100 |
| Postgres | 5432 |
| Redis | 6379 |
| Toxiproxy (failure testing) | 8474 (API), 5433, 6380 |

`docker compose up -d` starts Postgres, Redis and Toxiproxy. `pnpm dev` runs the API and the web app. Toxiproxy lets you inject latency or drops between the API and its databases to test failure handling.

### Tests

- `pnpm test` runs Vitest in each package (`core`, `chain`, `notify`, `shared`, `api`).
- Contract tests run with `cargo test` in `contract/cheque`.
- `pnpm e2e:contract` and `pnpm e2e:wallet` run full flows against testnet and need configured keys.

## 14. Operations and failure handling

- **Money is never silently lost.** A failed payout moves the cheque to `REFUND_REVIEW` for an operator. It does not terminate.
- **Failed payouts retry.** `AUTHORIZED` and `SETTLING` can return to `AUTHORIZED` and stay locked until they succeed or are reviewed.
- **Observability:** structured logs through `@cheque/shared`. `SENTRY_DSN` is in the config but error reporting is not wired up yet.
- **Health:** `GET /health` reports dependency status, and `chain/health.ts` checks the Stellar side.

## 15. Known gaps

- Mobile money and bank payout adapters are not implemented. Only the mock adapter exists.
- FX rates are placeholders. A live SEP-38 style quote service is needed.
- Recipient KYC thresholds and the regulatory path for holding customer funds are open. See the gaps table in [SPEC.md](SPEC.md).
- The WhatsApp webhook needs production credentials and a public URL to test end to end.
