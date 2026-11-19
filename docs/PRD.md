# Product Requirements Document — sencheq (Digital Cheques)

**Version 4.0 — Updated Spec**

- Primary Settlement: Stellar (Soroban USDC)
- Fiat Partner: Morapay (morapay.io)
- Cross-Chain Rail: Circle CCTP (Base & Solana)
- Wallet & Verification: Stellar Passkeys + Email OTP

## 1. Overview

sencheq is a cross-border digital cheque protocol and mobile-first web application. A sender creates a digital cheque addressed to a recipient's name and email address, generates a shareable link or QR code, and shares it over any channel (email, WhatsApp, Instagram DM, Telegram, X, or SMS) without needing the recipient's phone number or blockchain wallet address upfront. As soon as a cheque is funded, sencheq automatically sends an email alert to the recipient's email address with the cheque notification and claim link. The recipient verifies ownership of that email address via a 6-digit email verification code on mobile web and chooses where the funds land—requiring no prior app installation or account creation.

Funds are locked in a non-custodial USDC escrow smart contract on Stellar (Soroban) until redeemed or refunded. Users sign in, create self-custodial wallets, and persist their sent and received cheque history using one-tap Stellar Passkey Smart Wallets (WebAuthn / secp256r1), with Wallet USDC as the default funding rail alongside optional cross-chain USDC funding (Base and Solana via Circle CCTP) and Mobile Money on/off-ramps powered by Morapay.

| Dimension | Specification |
|---|---|
| Supported Corridors | Ghana (GHS Mobile Money via Morapay), Nigeria (NGN Bank via Morapay), United States (USD Bank — Phase 2), Global USDC (Stellar, Base, Solana) |
| Primary Funding Rail | Wallet USDC (Stellar Passkey Smart Wallet or Freighter) — default |
| Optional Funding Rails | Cross-Chain Wallet USDC (Base & Solana via Circle CCTP) and Ghana MoMo Push (via Morapay) |
| Recipient Verification & Alert | Instant email alert on cheque creation/funding + 6-digit Email OTP verification at claim |
| Recipient Claim Rails | Ghana MoMo (MTN/Telecel), Nigeria Bank, Instant Stellar Passkey Smart Wallet, or USDC on Stellar, Base, or Solana |
| Current Build Status | Testnet MVP & v4 Architecture; Soroban escrow + Passkey Smart Wallets + Email OTP/Alerts + Mock/Morapay/CCTP adapters |

## 2. Problem Statement

- Cross-Border Friction: Traditional remittance and crypto transfers are slow, costly, and force recipients to download apps, complete lengthy onboarding, or share sensitive bank/wallet details before a transfer can even begin.
- Phone & Wallet Discovery Friction: Senders frequently know a recipient's email address or social handle across borders without having their local mobile number or blockchain wallet address.
- Crypto UX Barriers: Seed phrases, native gas tokens (XLM/ETH/SOL), and manual trustlines prevent everyday senders and recipients from using stablecoin rails directly.
- Stranded & Unnoticed Transfers: Without automatic recipient notifications and deterministic on-chain expiry refunds, recipients miss incoming transfers or funds become permanently stranded.

## 3. Product Goals

- Sub-60-Second Email-Addressed Send: Create and fund a cheque using only a recipient's name and email address in under 60 seconds, with automatic email alerting and shareable link/QR output.
- Passwordless Stellar Passkey Smart Wallets & History: Provide one-tap biometric sign-up/login via Stellar Passkey Smart Wallets (WebAuthn / secp256r1) so users automatically get a non-custodial Stellar wallet and track their full sent and received cheque history.
- Wallet-First Funding with Multi-Rail Options: Default to direct Stellar Wallet USDC funding while offering optional Cross-Chain USDC (Base, Solana) and Ghana MoMo funding.
- Zero-App Recipient Claim via Email Verification: Recipients receive an instant email alert (or open a shared link), verify their email address with a 6-digit OTP code, and route funds to MoMo, bank, a new Passkey Smart Wallet, or any Stellar/Base/Solana address.
- On-Chain Safety Guarantees: Enforce single redemption on-chain in Soroban; guarantee zero silently lost funds via deterministic expiry and permissionless auto-refunds.
- Pluggable Settlement Architecture: Isolate fiat and cross-chain rails behind clean adapter interfaces (MorapayAdapter, StellarUsdcAdapter, CctpAdapter, MockAdapter).

## 4. Non-Goals (V1)

- US USD Bank Payouts: Deferred to Phase 2 behind a feature flag (Nigeria NGN bank payouts supported via Morapay once live credentials are enabled).
- Unbounded Multi-Currency Wallets: Senders hold and escrow USDC; local fiat conversion occurs strictly at funding or settlement boundaries.
- Heavy Upfront KYC for Micro-Transfers: Tiered limits apply; inline KYC triggers only above regulatory/provider thresholds.
- Custodial Private Key Storage: sencheq never holds user private keys or passkey secrets; Stellar Passkey Smart Wallets are self-custodial.

## 5. User Personas

| Persona | Profile & Context | Core Needs |
|---|---|---|
| Sender (Diaspora / Urban / Crypto-Native) | Sends money to friends, family, freelancers, or contacts across borders using their email address. | One-tap Stellar Passkey Smart Wallet login, persistent cheque history, Wallet-first USDC funding (with Base/Solana/MoMo options), automatic recipient email alerts, and cancel/refund controls. |
| Recipient (Global / Mobile-First) | Receives an automatic email alert or shared cheque link; may not have a crypto wallet or share their phone number. | Frictionless mobile web claim using 6-digit email verification, flexible payout choice (MoMo, bank, or USDC on Stellar/Base/Solana), and optional 1-tap Passkey Smart Wallet creation. |
| Ops / Admin | Monitors protocol health, liquidity rebalancing between Base (Morapay) and Stellar, email delivery, and compliance alerts. | Admin console for retryable payouts, drift alerts, blocklists, and high-value guardian veto oversight. |

## 6. User Stories

Sender Stories

- Passkey Smart Wallet & Login: As a sender, I want to sign up and log in with a single biometric Passkey prompt (Face ID / Touch ID / device PIN) that creates my non-custodial Stellar Smart Wallet and saves my cheque history.
- External Wallet Option: As a crypto user, I want the option to connect Freighter (Stellar), Base, or Solana wallets if I prefer using an existing wallet.
- Create Cheque with Recipient Email: As a sender, I want to enter a recipient name, recipient email address, USDC amount, optional note, and expiry—without needing their phone number or wallet address.
- Wallet-First & Optional Funding: As a sender, I want to fund directly from my Stellar Wallet USDC by default, or switch to Base USDC, Solana USDC, or Ghana MoMo push.
- Automatic Recipient Alert & Lifecycle Management: As a sender, I want the recipient to automatically receive an email alert when I fund the cheque, while also getting a shareable link/QR and full status tracking, cancel, and extend controls in my history.

Recipient Stories

- Instant Email Alert: As a recipient, I want to receive an immediate email notification when someone creates and funds a cheque with my email address so I never miss a transfer.
- Masked Preview & Email OTP Verification: As a recipient, I want to open the cheque link, see the masked cheque summary, and verify my ownership of the recipient email via a 6-digit verification code without needing a phone number or password.
- Flexible Destination Choice: As a recipient, I want to cash out to Ghana MoMo (MTN/Telecel), Nigeria Bank, an existing Stellar/Base/Solana USDC address, or create a 1-tap Stellar Passkey Smart Wallet to hold USDC and track my received history.

## 7. Functional Requirements

### 7.1 Authentication, Stellar Passkey Smart Wallets & Cheque History

- One-Tap WebAuthn Smart Wallet Onboarding: Clicking 'Continue with Passkey' registers a secp256r1 WebAuthn credential on the user's device and deploys a personal Soroban Smart Wallet (C... address) via a factory contract with relayer-sponsored gas—eliminating seed phrases and manual USDC trustlines.
- Persistent Account, Email Link & History: Backend binds the WebAuthn credential ID, Stellar Smart Wallet address, and optional verified user email to a users record in Postgres. Signing back in with Passkey restores full access to sent cheques, incoming/claimed cheques matched to their email or wallet, saved display name, and saved payout destinations.
- Recovery Guardian: Smart wallets configure a secondary recovery/guardian signer (e.g., backup Passkey or email-verified guardian recovery flow) so users can rotate credentials if a primary device is lost.
- Guest Claim Support: Recipients can claim directly to MoMo, bank, or an external wallet without creating an account, or opt into 1-tap Stellar Passkey Smart Wallet creation on the claim screen to hold USDC and save history.

### 7.2 Cheque Creation, Email Alerting & Email OTP Verification

- Cheque Inputs: Recipient display name, validated recipient email address (normalized lowercase), USDC amount (quantized to 6 decimal places for cross-chain compatibility), optional note (max 80 chars), and expiry preset (24h, 48h default, 7d, up to 30d max).
- Automatic Recipient Email Alert: Upon escrow funding confirmation, the backend dispatches a transactional email alert (via Resend) to the recipient's email address containing the sender's display name, masked/formatted amount, optional note, expiry timestamp, and direct claim link. Senders can also trigger a reminder alert once per 12 hours.
- Email OTP Verification at Claim: To unlock redemption, the recipient requests a 6-digit verification code sent to the cheque's registered recipient email address (5-minute TTL, salted SHA-256 hash stored at rest, constant-time comparison, 30s resend cooldown up to 3 resends, and hard lockout/cooldown after 5 failed attempts).

### 7.3 Funding Flow (Wallet-First + Multi-Rail Options)

- Primary Default — Stellar Wallet USDC: One-tap deposit from the sender's Stellar Passkey Smart Wallet (gas-sponsored) or Freighter wallet directly into the Soroban escrow contract (create_cheque).
- Optional Rail A — Cross-Chain Wallet USDC (Base & Solana): Sender connects a Base (EVM) or Solana wallet and calls Circle CCTP deposit_for_burn_with_hook, burning native USDC on Base/Solana and minting directly into the Stellar Soroban escrow (Stellar CCTP Domain 27).
- Optional Rail B — Ghana Mobile Money (Morapay): Sender enters their MTN or Telecel MoMo number to initiate a Morapay collection prompt (10-minute timeout). Upon verified Morapay webhook (Morapay-Signature), the backend locks Stellar USDC from the hot liquidity float into Soroban escrow while Morapay's Base USDC settlement rebalances to Stellar via CCTP.

### 7.4 Recipient Claim & Settlement Flow

- Landing & State Display: Displays cheque state (ACTIVE, CLAIMED, EXPIRED, CANCELLED, LOCKED, INVALID), masked recipient email (e.g., j***@gmail.com), amount, note, and expiry countdown.
- Claim Session: Verifying the 6-digit email OTP issues a 30-minute claim session token bound to the cheque and device fingerprint.
- Destination Selection & Execution: Recipient selects one of four payout rails: (1) Ghana MoMo (MTN/Telecel via Morapay Disbursement API), (2) Nigeria NGN Bank (via Morapay), (3) Stellar USDC (direct transfer to a new/existing Passkey Smart Wallet or external G.../C... address), or (4) Base / Solana USDC (cross-chain mint via Circle CCTP Forwarding Service, deducting destination gas from minted USDC so recipient needs zero ETH/SOL).

### 7.5 Backend & Soroban Smart Contracts

- Backend Reliability: Atomic single redemption via Postgres conditional UPDATE; unique live payout constraint per cheque; idempotency keys on all mutating endpoints; webhook deduplication by provider event ID; transactional outbox worker (handling email alerts and settlement jobs); double-entry ledger in integer minor units (6-decimal micro-USDC / 7-decimal stroops).
- Soroban Escrow Contract: Functions: create_cheque, redeem, cancel (funder only while active), refund (permissionless after expiry), pause/unpause, and high-value delay with guardian veto window. Roles: Admin (2-step transfer), Authority (backend settlement signer), Guardian (emergency veto).
- Soroban Smart Wallet Contract: Custom WebAuthn secp256r1 account implementing __check_auth via Stellar Smart Account Kit, supporting passkey signature verification, relayer fee sponsorship, and recovery signer rotation.

## 8. Non-Functional Requirements

- Security: 128-bit high-entropy claim tokens hashed at rest; salted SHA-256 email OTP hashing with constant-time comparison; 5-attempt OTP lockout + per-cheque/IP rate limiting; HMAC-SHA256 verification on Morapay requests and webhooks; destination lock upon redemption; audit logging; Ghana Data Protection Act compliance.
- Precision & Accounting: Enforce 6-decimal USDC quantization at API and escrow boundaries so Stellar SAC (7 decimals) and Circle CCTP (6 decimals) reconcile with zero rounding drift.
- Reliability: Zero stranded funds; exponential backoff retries for transient payout and email delivery errors; automated expiry sweeper and cross-chain/treasury reconciler running every 5 minutes.
- Performance: Mobile-first web bundle (<150 KB initial JS); real-time status updates via Server-Sent Events (SSE) with polling fallback.

## 9. Data Model (PostgreSQL)

| Table | Key Fields & Purpose |
|---|---|
| users | id, display_name, email (unique, optional), email_verified_at, passkey_credential_id, public_key_secp256r1, stellar_smart_wallet, fallback_wallet, default_payout_json, created_at |
| cheques | id, sender_user_id, recipient_name, recipient_email, amount_micro_usdc, note, claim_token_hash, status, expires_at, escrow_tx_hash, alert_sent_at |
| email_otps | id, cheque_id, recipient_email, otp_hash, otp_salt, attempts, resend_count, expires_at, verified_at |
| funding_records | id, cheque_id, rail (STELLAR_USDC \| BASE_CCTP \| SOLANA_CCTP \| MORAPAY_MOMO), source_chain, source_tx_or_ref, status, settled_at |
| claim_sessions | id, cheque_id, device_fingerprint_hash, verified_at, expires_at |
| destinations & payouts | id, cheque_id, rail (MOMO \| NGN_BANK \| STELLAR \| BASE \| SOLANA), destination_details_encrypted, quote_fx_rate, provider_ref, cctp_nonce, status |
| ledger_entries & outbox | Double-entry accounting journal (accounts, debit/credit micro-units), webhook_events (dedupe), idempotency_keys, outbox_events (email alerts & payouts), audit_logs |

## 10. API Surface

| Group | Endpoints | Description |
|---|---|---|
| Auth & Smart Wallet | POST /v1/auth/passkey/register-options, /register-verify, /login-options, /login-verify; GET/PATCH /v1/me | WebAuthn Passkey registration & login, Stellar Smart Wallet deployment, profile & sent/received history sync |
| Sender Cheques | POST /v1/cheques, POST /v1/cheques/:id/fund, POST /v1/cheques/:id/resend-alert, POST /v1/cheques/:id/cancel, POST /v1/cheques/:id/extend, GET /v1/cheques/history | Create cheque with recipient email, initiate Wallet/CCTP/MoMo funding, trigger email alert, manage active cheques, fetch history |
| Recipient Claim | GET /v1/claim/:token, POST /v1/claim/:token/otp/send, POST /v1/claim/:token/otp/verify, POST /v1/claim/:token/redeem, GET /v1/claim/:token/status | Public masked preview, 6-digit email OTP send/verify, destination validation, atomic redemption & live status |
| Webhooks & Workers | POST /v1/webhooks/morapay, POST /v1/webhooks/cctp, POST /v1/webhooks/resend; background workers (expiry-sweeper, reconciler, outbox) | HMAC-verified Morapay callbacks, Circle attestation relay, email delivery tracking, auto-refunds, and Base-to-Stellar liquidity rebalancing |

## 11. Architecture & Integrations

- Monorepo Structure: pnpm monorepo: apps/web (Next.js App Router, mobile-first), apps/api (Fastify + TypeScript), packages/core (domain logic & ledger), packages/chain (Stellar SDK, Smart Account Kit, CCTP client), packages/adapters (Morapay, Mock), packages/notify (Resend email templates), contracts/ (Rust/Soroban escrow & smart wallet).
- Infrastructure: PostgreSQL (primary datastore & ledger), Redis (OTP rate limits, attempt counters, session cache), Docker, sponsored Soroban fee relayer.
- Morapay Integration (morapay.io): REST API authenticated via Morapay-Key, Morapay-Timestamp, and HMAC-SHA256 Morapay-Signature headers; supports Ghana MoMo collections/disbursements (MTN, Telecel) and Nigeria bank payouts, settling stablecoin liquidity on Base.
- Circle CCTP Integration: Native burn-and-mint USDC transfers across Stellar (Domain 27), Base, and Solana using deposit_for_burn_with_hook and Circle's Forwarding Service for gasless destination claims.
- Email Verification & Alerts (Resend): Transactional email delivery via Resend with SPF/DKIM/DMARC authentication for instant recipient cheque alerts (when a cheque is created with their email), 6-digit claim verification OTPs, and optional sender settlement/refund receipts.

## 12. Metrics, KPIs & Alerting

- Funnel Conversion: Passkey Smart Wallet sign-up rate; Cheque Created -> Funded -> Email Alert Delivered -> Link Opened -> Email OTP Verified -> Settled conversion rates.
- Rail Breakdown & Speed: Share of funding/claims across Stellar Wallet, Base CCTP, Solana CCTP, and Morapay MoMo; median time-to-payout per rail.
- Security & Reliability: Email OTP delivery latency (<5s), verification success rate, lockout rate, zero double-redemptions, and 100% auto-refund execution within 5 minutes of expiry.
- Operational Alerts: Stuck SETTLING > 15 min, Stellar hot-float threshold low, Base-to-Stellar CCTP rebalance lag, ledger drift != 0, Resend email bounce/outage, and Morapay webhook failures.

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Sender mistypes recipient email address | Email alert and OTP go to wrong inbox; recipient cannot verify. | Allow sender to cancel anytime while ACTIVE, display masked email clearly on confirmation, and auto-refund on expiry if unclaimed. |
| Email OTP spam filtering or delivery delay | Recipient delayed in claiming cheque. | Configure dedicated sending domain with SPF/DKIM/DMARC, keep OTP templates lightweight plain-text + clean HTML, and support 30s resend (up to 3x). |
| Morapay Base-to-Stellar settlement lag | Delay between MoMo payment confirmation and Stellar escrow lock. | Maintain a pre-funded Stellar USDC hot float for instant escrow creation while Morapay's Base USDC settlements bridge back to Stellar asynchronously via CCTP. |
| Lost passkey device | User loses access to their Smart Wallet and cheque history. | Platform passkeys sync via iCloud/Google Password Manager; attach a backup passkey or email-verified guardian recovery signer on the Smart Wallet. |
| Cross-chain decimal mismatch (6 vs 7) | Rounding dust or failed CCTP mints. | Quantize all cheque amounts to 6 decimal places (micro-USDC) across API, Postgres, and Soroban escrow. |
| Sponsored gas abuse on Passkey creation | Relayer XLM drain via bot sign-ups. | Rate-limit Passkey Smart Wallet deployment per IP/device challenge and deploy smart wallets lazily on first cheque creation or claim. |

## 14. Roadmap

- Phase 1 — Stellar-Native, Passkey Smart Wallets & Email Flow MVP (Testnet): Soroban escrow contract, WebAuthn Passkey Smart Wallet login + cheque history, Wallet USDC funding, Resend recipient email alerts + 6-digit email OTP verification, Stellar USDC & Mock MoMo claim adapters, public testnet demo.
- Phase 2 — Cross-Chain CCTP & Live Morapay (Testnet -> Mainnet): Circle CCTP integration for Base & Solana funding/claiming, live Morapay Ghana MoMo & Nigeria NGN bank adapters, hot-float rebalancing engine, security audit.
- Phase 3 — Scale & Institutional Hardening: US bank payout rail, multi-sig treasury, HSM/KMS relayer keys, automated FX buffer accounting, and advanced analytics console.

## 15. Open Questions

- Morapay Settlement Tiers: Confirm live Morapay transaction limits, KYC thresholds for GHS/NGN corridors, and exact Base USDC settlement batch timings.
- Lazy vs. Eager Smart Wallet Deployment: Validate whether deploying the Soroban Smart Wallet lazily on first transaction (counterfactual C... address on login) optimizes relayer XLM costs.
- High-Value Guardian Thresholds: Define the exact USDC amount threshold that triggers the Soroban high-value guardian delay window.

## 16. Success Criteria

- End-to-End Passkey & Cheque Loop: User creates a Stellar Smart Wallet via Passkey, funds a cheque with Wallet USDC, triggers an automatic email alert to the recipient, and logs back in to view complete cheque history.
- Email Alert & OTP Claim: Recipient receives the email alert, verifies via 6-digit email OTP without needing an account, and settles to MoMo (adapter) or Stellar/Base/Solana USDC.
- Deterministic Safety: Zero double-redemptions under concurrent claim requests; 100% of expired unclaimed cheques refunded cleanly.
- Build & Test Quality: All Soroban contract unit/integration tests and monorepo pnpm test / pnpm build checks pass cleanly.

## 17. MVP Scope (Stellar-Native & SCF-Friendly)

MVP Execution Strategy: Prioritize high-leverage Stellar primitives first—Soroban Escrow, WebAuthn Passkey Smart Wallets, and Wallet USDC—paired with frictionless Email Alerts and 6-digit Email OTP verification, while keeping Morapay and Cross-Chain CCTP behind clean adapter interfaces.

- Passkey Smart Wallet Login & History: One-tap WebAuthn Passkey sign-up/login creating a Stellar Smart Wallet with persistent sent/received cheque history (plus Freighter fallback).
- Wallet-First Cheque Creation & Email Alert: Fund directly with Stellar USDC into Soroban escrow (create_cheque) with recipient email and expiry, automatically dispatching an email alert to the recipient.
- Mobile Web Claim & Email OTP: Public claim link page with masked preview, 6-digit email OTP verification, and redemption to Stellar USDC (or 1-tap Passkey Smart Wallet) + Mock MoMo option.
- Lifecycle & Public Proof: Cancel/refund/expiry event indexing, public testnet demo with Stellar Explorer transaction links, and open-source Soroban contracts + architecture docs.

## 18. Future Improvements (Post-MVP)

- Full Cross-Chain & Fiat Live Activation: Production Circle CCTP (Base & Solana) and live Morapay Ghana MoMo + Nigeria NGN bank payouts.
- Recurring & Batch Cheques: Payroll or creator payouts via multi-cheque CSV/batch creation from a single Passkey Smart Wallet.
- Programmable Claim Conditions: Optional time-locked vesting, multi-signature approvals, or organization domain restrictions.
- Treasury & Risk Automation: Multi-sig admin treasury, HSM/KMS relayer signing, automated CCTP float rebalancer, and sanctions screening.

No code changes made.
