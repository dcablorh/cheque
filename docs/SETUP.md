# Manual Setup Guide

This document describes the manual steps required to run the digital cheques application locally for development and testing.

## Prerequisites

- **Node.js** ≥ 20 (LTS recommended)
- **pnpm** ≥ 10 (`corepack enable pnpm`)
- **Rust** ≥ 1.78 (for building the Soroban contract: `rustup target add wasm32v1-none`)
- **Docker** + **Docker Compose** (for PostgreSQL and Redis)
- **Stellar CLI** (`cargo install --locked stellar-cli`) for contract deployment

---

## 1. Environment Configuration

Create a `.env.local` file at the **workspace root** (`stellar/cheque/.env.local`) with the following variables:

```bash
# ────────────────────────────────────────────────────────────────
# Core Stellar Configuration
# ────────────────────────────────────────────────────────────────
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org:443
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Your Stellar account that will deploy/admin the contract
STELLAR_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
STELLAR_PUBLIC_KEY=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Deployed contract ID (after running `pnpm deploy:contract`)
CHEQUE_CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# USDC on Stellar Testnet
USDC_CODE=USDC
USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

# ────────────────────────────────────────────────────────────────
# Database & Cache (Docker Compose provides these)
# ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://cheque_user:cheque_pass@localhost:5432/cheque_db
REDIS_URL=redis://localhost:6379

# ────────────────────────────────────────────────────────────────
# API Server
# ────────────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug

# JWT secrets (generate with `openssl rand -hex 32`)
JWT_ACCESS_SECRET=your-access-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# ────────────────────────────────────────────────────────────────
# Email OTP (Resend) — required for email auth & alerts
# ────────────────────────────────────────────────────────────────
EMAIL_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=no-reply@yourdomain.com
EMAIL_FROM_NAME=sencheq

# ────────────────────────────────────────────────────────────────
# CCTP (Cross-Chain Transfer Protocol) — Circle
# ────────────────────────────────────────────────────────────────
CCTP_ENABLED=true
CCTP_DOMAIN=0  # 0 = Stellar testnet in Circle's domain mapping
CCTP_ATTESTATION_URL=https://iris-api-sandbox.circle.com/attestations

# ────────────────────────────────────────────────────────────────
# Frontend
# ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3100
```

**Important**: The frontend and API packages **do not** have their own `.env.local` files — they read from the workspace root.

---

## 2. Start Infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d
```

This starts:
- PostgreSQL on port 5432 (database: `cheque_db`, user: `cheque_user`, pass: `cheque_pass`)
- Redis on port 6379

Verify:
```bash
docker compose ps
docker compose logs -f postgres
```

---

## 3. Database Migrations

The API runs migrations automatically on startup, but you can run them manually:

```bash
pnpm --filter @cheque/api run db:migrate
```

Or via the bootstrap script (which also funds testnet accounts):

```bash
pnpm bootstrap:testnet
```

---

## 4. Build & Deploy Soroban Contract

```bash
# Build the contract (WASM)
pnpm build:contract

# Deploy to Stellar Testnet (requires STELLAR_SECRET_KEY in .env.local)
pnpm deploy:contract
```

This will output a `CHEQUE_CONTRACT_ID` — copy it into your `.env.local`.

---

## 5. Run Development Servers

### Terminal 1: API Server
```bash
pnpm dev:api
```
Runs on `http://localhost:3001`

### Terminal 2: Frontend
```bash
pnpm dev:web
```
Runs on `http://localhost:3100`

---

## 6. Verify End-to-End Flow

1. Open `http://localhost:3100` → click **Write a cheque**
2. Sign in with email (OTP sent via Resend)
3. Create a cheque: recipient name, amount, country (GH/NG/US)
4. Fund the cheque (wallet funding if enabled, or manual deposit)
5. Copy the claim link → open in incognito/different browser
6. Claim: choose Stellar, Base, or Solana destination
7. Verify USDC arrives in destination wallet

---

## 7. Testing

```bash
# All tests (requires Postgres + Redis running)
pnpm test

# Watch mode
pnpm test:watch

# Specific test file
pnpm vitest run api/test/api.test.ts
```

**Note**: Email OTP tests require `EMAIL_API_KEY` (Resend). CCTP tests require Circle sandbox credentials.

---

## 8. Common Issues

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED 5432` | `docker compose up -d` (PostgreSQL not running) |
| `ECONNREFUSED 6379` | `docker compose up -d` (Redis not running) |
| `401` on email OTP | Add valid `EMAIL_API_KEY` from Resend |
| `CCTP not configured` | Set `CCTP_ENABLED=true` + valid Circle credentials |
| Contract deploy fails | Ensure `STELLAR_SECRET_KEY` has testnet XLM (friendbot) |
| Wallet connect fails | Use a Stellar wallet (Freighter, Albedo, Lobstr) on testnet |

---

## 9. Project Structure

```
stellar/cheque/
├── api/                    # Hono + Node.js API server
├── frontend/               # Next.js 14 (App Router) frontend
├── packages/
│   ├── core/               # Shared business logic, migrations, ledger
│   ├── shared/             # Env loading, config types
│   ├── chain/              # Stellar/Soroban contract interactions
│   └── notify/             # Email delivery (Resend), OTP service
├── contract/               # Soroban smart contract (Rust)
├── scripts/                # Bootstrap, deploy, E2E test scripts
├── docker-compose.yml      # Postgres + Redis
└── .env.local              # **All secrets here** (gitignored)
```

---

## 10. Useful Commands

```bash
# Reset database (drop + recreate + migrate)
docker compose down -v && docker compose up -d && pnpm bootstrap:testnet

# View API logs
pnpm --filter @cheque/api dev

# Build all packages
pnpm build

# Lint
pnpm -r run lint
```