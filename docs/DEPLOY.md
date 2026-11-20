# Deployment Guide

Architecture: **frontend on Vercel, API + Postgres + Redis on Render.**

```
Browser ──> Vercel (Next.js frontend)
                │  NEXT_PUBLIC_API_URL
                ▼
        Render web service (Fastify API, routes under /api)
                │                │
        Render Postgres    Render Key Value (Redis)
```

Because the API runs as a long-running process on Render, the outbox worker and
expiry sweeper start in-process automatically — no cron setup needed.
(The `/api/internal/tick` endpoint still exists and is handy for manual kicks,
guarded by `CRON_SECRET`.)

---

## 1. Backend on Render (one click via Blueprint)

1. Push this branch to GitHub (already done: `origin/staging`).
2. Render Dashboard → **New → Blueprint** → select the `dcablorh/cheque` repo and the `staging` branch.
3. Render reads `render.yaml` and provisions:
   - `cheque-api` — Node web service (build: pnpm install + build API and its workspace packages; start: `node api/dist/server.js`; health check: `/api/health`)
   - `cheque-db` — free Postgres (`DATABASE_URL` is wired automatically)
   - `cheque-redis` — free Key Value / Redis, internal-only (`REDIS_URL` wired automatically)
   - `JWT_SECRET`, `OTP_SALT`, `CRON_SECRET` — generated once and kept stable
4. At sync time Render prompts for every `sync: false` variable — paste:
   - `EMAIL_API_KEY` (Resend — required in production)
   - `NEXT_PUBLIC_APP_URL` — your **Vercel frontend URL** (e.g. `https://cheque.vercel.app`); this drives CORS
   - The Stellar account secrets from `.env.local`: `CONTRACT_ADMIN_SECRET`, `CLAIM_AUTHORITY_PUBLIC`/`SECRET`, `GUARDIAN_SECRET`, `FUNDING_ACCOUNT_SECRET`, `SETTLEMENT_ACCOUNT_PUBLIC`/`SECRET`, `FEE_SOURCE_PUBLIC`/`SECRET`, `CHANNEL_ACCOUNT_SECRETS`
   - Optionally `FX_GHS_PER_USDC`, `ENABLED_CORRIDORS` (defaults apply otherwise)
5. Deploy, then verify: open `https://cheque-api-xxxx.onrender.com/api/health` → expect `"status":"ok"` and `"database":"connected"`. Check the logs for `Database migrations verified and up-to-date.` — migrations run automatically on boot.

### Free-plan caveats
- Free web services **spin down after ~15 min idle** → first request has a ~30s cold start. Use the **starter** plan for launch.
- Free Postgres **expires after 30 days** — upgrade before then or the data is gone.

---

## 2. Frontend on Vercel

1. Vercel → **Add New → Project** → import `dcablorh/cheque`.
2. Vercel reads `vercel.json`: a single `frontend` service (Next.js, root `frontend/`).
3. Set the project env var:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_APP_URL` | `https://<your-vercel-domain>` |
   | `NEXT_PUBLIC_API_URL` | `https://cheque-api-xxxx.onrender.com/api` ← **your Render API URL + `/api`** |

   The `/api` suffix matters: all API routes live under that prefix.
4. Deploy.

> Alternative (no CORS at all): keep `NEXT_PUBLIC_API_URL=/api` on the frontend and add a rewrite in `vercel.json`:
> `{ "source": "/api/(.*)", "destination": "https://cheque-api-xxxx.onrender.com/api/$1" }`.
> The browser then talks only to the Vercel domain and Vercel proxies to Render.

---

## 3. Environment variable reference

Wired automatically by the blueprint: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `OTP_SALT`, `CRON_SECRET`, `PORT` (Render injects it), Stellar network constants (testnet values are in `render.yaml`).

You paste once: `EMAIL_API_KEY`, `NEXT_PUBLIC_APP_URL`, all Stellar account secrets, optional FX/corridor overrides.

Frontend (Vercel): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`.

Local development keeps working exactly as before (`pnpm dev` + root `.env.local`); see `docs/SETUP.md`.

---

## 4. Post-deploy checklist

- [ ] `GET /api/health` returns `ok` / `database: connected`
- [ ] Sender email login works from the Vercel frontend (Resend OTP arrives)
- [ ] Send a test cheque on testnet; confirm funding + claim emails arrive
- [ ] Let a test cheque expire → sweeper queues the refund (check logs for `[sweeper]`)
- [ ] CCTP cross-chain quote works if `SOLANA_*` / CCTP vars are set
