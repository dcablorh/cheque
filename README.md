# sencheq

**If you can send a message, you can send money.**

sencheq is a cross-border digital cheque. A sender writes a cheque for someone in another country, gets a link, and sends it on WhatsApp, Telegram, SMS or email. Whoever holds the link can claim the money and choose where it goes. The recipient needs no app and no account.

Corridors: **Ghana (GHS, mobile money), Nigeria (NGN, bank) and the United States (USD, bank)**. Money is held in an on-chain escrow on the Stellar network until it is claimed or refunded.

> Status: early build. Settlement runs on Stellar testnet with USDC. Local cash-out (mobile money and bank payouts) is being connected and is not live yet.

## How it works

1. **Write.** The sender enters the recipient's name, the amount in the recipient's currency, an optional note and an expiry (24 hours, 48 hours or 7 days). They can add a signature.
2. **Fund.** The amount is locked in a Soroban escrow contract as USDC. The sender can pay with a Stellar wallet.
3. **Share.** The sender gets a claim link and sends it to the recipient in any chat app.
4. **Claim.** The recipient opens the link, sees the cheque, verifies their phone with a one-time code, and chooses a destination.
5. **Settle or refund.** The money is paid out to the destination. If nobody claims it before it expires, the escrow returns it to the sender automatically. A sender can cancel before the recipient starts claiming.

Each cheque shows the amount in words and figures, the recipient, the sender, a cheque number and a memo, so it reads like a real cheque.

## Principles

- **The user sees a cheque, not a blockchain.** Stellar, USDC and settlement details stay in small print.
- **Sender says who. Recipient says where.**
- **Money is locked once and leaves once.** A cheque can be redeemed only one time, enforced on-chain.
- **Nothing is silently lost.** Every state change is recorded, and unclaimed money goes back.
- **Providers are replaceable.** Settlement sits behind an adapter interface.

## Repository layout

| Path | What it is |
|---|---|
| `frontend/` | Next.js web app: landing page, sender app (`/app`) and claim page (`/c/[token]`) |
| `api/` | Fastify API: cheques, claims, auth, configuration and the outbox worker |
| `packages/core` | Domain logic: state machine, money, corridors, ledger, outbox, migrations |
| `packages/chain` | Stellar and Soroban client, signing, idempotent chain operations |
| `packages/notify` | Phone normalisation, OTP over WhatsApp with SMS fallback, auth tokens |
| `packages/shared` | Environment parsing and logging |
| `contract/cheque` | Soroban escrow contract (Rust) |
| `scripts/` | Testnet bootstrap, contract deploy and end-to-end flows |
| `docs/` | Product spec, implementation spec, contract spec, design system, settlement guides |

All project documentation is consolidated in the **`docs/`** directory:
- **[docs/cheque.md](docs/cheque.md)** — Digital Cheques for Ghana implementation spec
- **[docs/SPEC.md](docs/SPEC.md)** — Core product specification
- **[docs/CONTRACT.md](docs/CONTRACT.md)** — Soroban smart contract specification
- **[docs/DESIGN.md](docs/DESIGN.md)** — Visual design system and UI components
- **[docs/moropay.md](docs/moropay.md)** — MoraPay offramp & onramp integration guide
- **[docs/SEEVCASH_FINDINGS.md](docs/SEEVCASH_FINDINGS.md)** — SeevCash Stellar Anchor findings
- **[docs/morapay/](docs/morapay/README.md)** — Mirrored MoraPay developer documentation

## Quick start

Requirements: Node 20+, pnpm 10, Docker (for Postgres and Redis). Rust and the `wasm32v1-none` target are only needed to build the contract.

```bash
# 1. install dependencies
pnpm install

# 2. start Postgres and Redis
docker compose up -d

# 3. create your env file and fill in the blanks
cp .env.example .env

# 4. create testnet accounts and fund them (writes the public keys to .env)
pnpm bootstrap:testnet

# 5. run the API (port 3001) and the web app (port 3100)
pnpm dev
```

Open http://localhost:3100. The API runs its database migrations on start.

To run the whole web app in the browser with fake data and no API, set `NEXT_PUBLIC_DEMO=1` in the frontend environment.

### Useful commands

| Command | Does |
|---|---|
| `pnpm test` | Runs the unit tests in every package |
| `pnpm build` | Builds all packages and the frontend |
| `pnpm build:contract` | Builds the Soroban contract to WASM |
| `pnpm deploy:contract` | Deploys the contract to testnet |
| `pnpm e2e:contract` | Runs the contract flow end to end |
| `pnpm e2e:wallet` | Runs the wallet funding flow end to end |

## Configuration

All settings live in `.env`. See `.env.example` for the full list and the comments. The main groups are:

- **Database and cache:** `DATABASE_URL`, `REDIS_URL`
- **Stellar:** `STELLAR_NETWORK`, horizon and Soroban RPC URLs, USDC issuer, `CHEQUE_CONTRACT_ID`, and the testnet account keys
- **Messaging:** WhatsApp Cloud API, SMS provider, and the email key for cheque notifications
- **Pricing:** `ENABLED_CORRIDORS`, FX rates per corridor, and `FEE_BPS` (100 bps = 1%)
- **Security:** `JWT_SECRET` and `OTP_SALT`. Change both before any shared deployment.

Never commit secret keys. The `.env` file is ignored by git.

## Status and known limits

- Funding and USDC payouts run on the Stellar testnet. Mobile money (MTN, Telecel, AirtelTigo) and bank payouts go through a settlement adapter that only has a mock implementation so far.
- The FX rates in `.env.example` are placeholders. Replace them with live quotes before launch.
- Regulatory approval for holding and paying out customer funds is still open. Settle it before any real money moves.

## Running locally (contributors)

1. Install prerequisites: Node 20+, pnpm 10, Docker (Postgres + Redis). Rust + `wasm32v1-none` target only for the contract.
2. `pnpm install`
3. `docker compose up -d` (Postgres on 5432, Redis on 6379)
4. `cp .env.example .env` and fill in secrets; bootstrap writes testnet keys to `.env.local`.
5. `pnpm bootstrap:testnet`
6. `pnpm build:contract && pnpm deploy:contract`
7. Copy env if needed: `cp .env.local api/.env.local`
8. `pnpm dev` (web: 3100, API: 3001; migrations run on API start)
9. Optional demo mode: set `NEXT_PUBLIC_DEMO=1` in the frontend env.

Useful: `pnpm test`, `pnpm build`, `pnpm lint`. Without Redis, OTP and IP rate-limit state fall back to in-memory stores for development. Cheque state, the ledger, and the outbox still require Postgres.

## Contributing

Work on a branch, open a pull request into `main`, and keep changes focused. Run `pnpm test` and `pnpm build` before you push.
