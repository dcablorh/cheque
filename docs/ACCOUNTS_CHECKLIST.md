# Accounts, Credentials & External Integrations Checklist

This document tracks every external account, credential, and third-party configuration needed to operate **Digital Cheques for Ghana** across Testnet/Sandbox and Production.

---

## 1. Credentials Checklist Summary

| Integration / Service | Credentials / Keys Needed | Owner | Where to Get / Registration URL | Status / Action Needed | Must Do By Hand? |
|---|---|---|---|---|---|
| **Stellar Testnet Accounts** | Public & Secret Keys for: Admin, Claim Authority, Guardian, Funding, Settlement, Fee Source, Channels (3) | Automated / Dev | Run `pnpm bootstrap:testnet` | Generated & funded via Friendbot + USDC trustlines established | ❌ Automated by script |
| **Testnet USDC Tokens** | Testnet USDC on Funding/Settlement accounts | Developer | [Circle Faucet](https://faucet.circle.com/) | Select Stellar Testnet and paste Settlement/Funding public key | ⚠️ **YES (Hand)** |
| **SeevCash Sandbox** | `SEEV_CASH_BASE_URL`, `SEEV_CASH_API_KEY`, `SEEV_CASH_WEBHOOK_SECRET` | Partner / FinTech Ops | [SeevCash Developer Portal](https://seevcash.com) or partnerships@seevcash.com | Contact SeevCash for sandbox client credentials & webhook signing secret | ⚠️ **YES (Hand)** |
| **Meta WhatsApp Cloud API** | `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Product / WhatsApp Admin | [Meta for Developers](https://developers.facebook.com) -> WhatsApp App | Create Meta App, configure WhatsApp Business phone number, and submit templates | ⚠️ **YES (Hand)** |
| **SMS Fallback Provider** | `SMS_PROVIDER` (HUBTEL / ARKESEL / TWILIO), `SMS_API_KEY`, `SMS_API_SECRET`, `SMS_SENDER_ID` | Platform Ops | [Hubtel Ghana](https://hubtel.com) or [Arkesel Ghana](https://arkesel.com) or [Twilio](https://twilio.com) | Sign up for Ghana SMS API account and register approved Sender ID (`CHEQUE`) | ⚠️ **YES (Hand)** |
| **PostgreSQL 16 & Redis 7** | `DATABASE_URL`, `REDIS_URL` | DevOps / Local | `docker-compose up -d` or managed Cloud SQL / Aiven / Supabase | Preconfigured in `docker-compose.yml` for local dev | ❌ Preconfigured |
| **Domain & TLS** | Public domain (e.g. `cheq.app`), SSL certificate | DevOps | Cloudflare / Vercel / AWS Route53 | Configure DNS records for Web App (`cheq.app`) and API (`api.cheq.app`) | ⚠️ **YES (Hand)** |
| **Error Tracking** | `SENTRY_DSN` | DevOps | [Sentry.io](https://sentry.io) | Create Sentry project for Fastify backend & Next.js frontend | ⚠️ **YES (Hand)** |

---

## 2. Circle USDC on Stellar Testnet

*   **Official Documentation Citation:** [Circle Quickstart: Transfer USDC on Stellar](https://developers.circle.com/stablecoins/docs/quickstart-transfer-10-usdc-on-chain)
*   **Testnet Issuer Address:** `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
*   **Asset Code:** `USDC`
*   **Decimals:** 7 (1 USDC = 10,000,000 stroops)
*   **Official Faucet:** [https://faucet.circle.com/](https://faucet.circle.com/)
    *   *Action for User:* Open the faucet URL, select **Stellar**, paste the `SETTLEMENT_ACCOUNT_PUBLIC` address from your generated `.env.local`, and click **Get Tokens**.

---

## 3. Meta WhatsApp Cloud API — Template Submissions

Submit the following 5 pre-approved templates in the **Meta WhatsApp Manager** under **Message Templates**:

### Template 1: `otp`
*   **Category:** `AUTHENTICATION`
*   **Language:** English (`en`)
*   **Buttons:** One-Tap Autofill / Copy Code
*   **Body Copy:**
    ```
    Your Digital Cheque verification code is {{1}}. This code expires in 5 minutes. Do not share it with anyone.
    ```
*   **Variable sample:** `{{1}}` -> `842915`

### Template 2: `cheque_received`
*   **Category:** `MARKETING` / `UTILITY`
*   **Language:** English (`en`)
*   **Body Copy:**
    ```
    Hi {{1}}, you have received a Digital Cheque of GHS {{2}} from {{3}}. Tap the link below to verify your WhatsApp number and claim your money directly to Mobile Money or USDC.

    Claim your cheque: {{4}}
    ```
*   **Variable samples:**
    *   `{{1}}` -> `Kojo`
    *   `{{2}}` -> `500.00`
    *   `{{3}}` -> `Kwame`
    *   `{{4}}` -> `https://cheq.app/c/xK89s12...`

### Template 3: `cheque_claimed`
*   **Category:** `UTILITY`
*   **Language:** English (`en`)
*   **Body Copy:**
    ```
    Notification: Your cheque for GHS {{1}} payable to {{2}} was verified and claimed to {{3}}. Reference: {{4}}.
    ```
*   **Variable samples:**
    *   `{{1}}` -> `500.00`
    *   `{{2}}` -> `Kojo Mensah`
    *   `{{3}}` -> `MTN ••• 4821`
    *   `{{4}}` -> `CHQ-82F91K`

### Template 4: `cheque_expiring`
*   **Category:** `UTILITY`
*   **Language:** English (`en`)
*   **Body Copy:**
    ```
    Reminder: You have an unclaimed Digital Cheque of GHS {{1}} that will expire in {{2}} hours. Open your claim link before it expires: {{3}}
    ```
*   **Variable samples:**
    *   `{{1}}` -> `500.00`
    *   `{{2}}` -> `12`
    *   `{{3}}` -> `https://cheq.app/c/xK89s12...`

### Template 5: `payout_delivered`
*   **Category:** `UTILITY`
*   **Language:** English (`en`)
*   **Body Copy:**
    ```
    Success! GHS {{1}} has been paid out to your {{2}}. Transaction Reference: {{3}}. Thank you for using Digital Cheques.
    ```
*   **Variable samples:**
    *   `{{1}}` -> `500.00`
    *   `{{2}}` -> `MTN Mobile Money account (••• 4821)`
    *   `{{3}}` -> `PAY-9920182`

---

## 4. SeevCash Sandbox Onboarding

1. Contact SeevCash partnership team or log in to the developer sandbox.
2. Provide your settlement webhook callback URL: `https://api.cheq.app/v1/webhooks/seevcash`.
3. Obtain:
   - Client API Key (`SEEV_CASH_API_KEY`)
   - Sandbox Base URL (`SEEV_CASH_BASE_URL`)
   - HMAC Webhook Signing Secret (`SEEV_CASH_WEBHOOK_SECRET`)
   - Test Mobile Money phone numbers (MTN, Telecel, AirtelTigo) configured for successful and simulated failed payouts.

---

## 5. SMS Fallback Configuration (Ghana Providers)

If WhatsApp OTP delivery fails or user opts for SMS:
*   **Primary Ghana Choice: Hubtel**
    *   Dashboard: [https://hubtel.com](https://hubtel.com)
    *   Create API Client ID and API Client Secret.
    *   Register Sender ID: `CHEQUE` (Bank of Ghana / NCA guidelines require registered brand sender ID).
*   **Alternative Ghana Choice: Arkesel**
    *   Dashboard: [https://arkesel.com](https://arkesel.com)
    *   Obtain API Key and register Sender ID.
