# Accounts, Credentials & External Integrations Checklist

---

## 1. Credentials Checklist Summary

| Integration / Service | Credentials / Keys Needed | Owner | Where to Get / Registration URL | Status / Action Needed | Must Do By Hand? |
|---|---|---|---|---|---|
| **Stellar Testnet Accounts** | Public & Secret Keys for: Admin, Claim Authority, Guardian, Funding, Settlement, Fee Source, Channels (3) | Automated / Dev | Run `pnpm bootstrap:testnet` | Generated & funded via Friendbot + USDC trustlines established | ❌ Automated by script |
| **Testnet USDC Tokens** | Testnet USDC on Funding/Settlement accounts | Developer | [Circle Faucet](https://faucet.circle.com/) | Select Stellar Testnet and paste Settlement/Funding public key | ⚠️ **YES (Hand)** |
| **Resend (Transactional Email)** | `EMAIL_API_KEY` | Product / Ops | [Resend Dashboard](https://resend.com) -> API Keys | Create API key and verify sending domain (`mail.cheq.app` or similar) for OTP + cheque notifications | ⚠️ **YES (Hand)** |
| **PostgreSQL 16 & Redis 7** | `DATABASE_URL`, `REDIS_URL` | DevOps / Local | `docker-compose up -d` or managed Cloud SQL / Aiven / Supabase | Preconfigured in `docker-compose.yml` for local dev | ❌ Preconfigured |
| **Domain & TLS** | Public domain (e.g. `cheq.app`), SSL certificate | DevOps | Cloudflare / Vercel / AWS Route53 | Configure DNS records for Web App (`cheq.app`) and API (`api.cheq.app`) | ⚠️ **YES (Hand)** |
| **Error Tracking** | `SENTRY_DSN` | DevOps | [Sentry.io](https://sentry.io) | Create Sentry project for Fastify backend & Next.js frontend | ⚠️ **YES (Hand)** |

---

## 2. Circle USDC on Stellar Testnet

*   **Dashboard:** [https://faucet.circle.com/](https://faucet.circle.com/)
*   **Action:** Select **Stellar Testnet**, paste the `Settlement` and `Funding` account public keys, and request testnet USDC.
*   **Why:** The cheque contract locks native-issued USDC on Stellar. Senders fund in USDC; recipients can redeem to Mobile Money (future MoraPay integration) or keep USDC.

---

## 3. Resend — Transactional Email (the only notification channel)

All sender login and payee notifications are **email-only** (no phone / WhatsApp / SMS anywhere in the product).

*   **Dashboard:** [https://resend.com](https://resend.com)
*   **Obtain:** API key -> set `EMAIL_API_KEY` in `.env.local` (local) or the deployment platform env vars (production).
*   **Verify a sending domain** so emails come from your own domain instead of the shared test sender; set the from-address in the email client config.
*   **Emails sent by the API:**
    *   Sender login OTP (`/auth/email/otp/request`)
    *   Payee claim OTP (`/claim/:ref/otp/send`)
    *   Cheque received / status / expiry alert emails (queued through the outbox as `email:cheque:*` jobs)

> Without `EMAIL_API_KEY` the API runs in dev mode: OTPs and alerts are printed to the server console instead of being sent.
