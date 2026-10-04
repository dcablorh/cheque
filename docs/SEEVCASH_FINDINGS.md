# SeevCash Integration Findings & Technical Assessment

**Document Version:** 1.0.0  
**Date:** October 4, 2026  
**Environment:** Stellar Testnet / SeevCash Sandbox  
**Live Target Anchor:** [`https://anchor.seevcash.com`](https://anchor.seevcash.com)  
**Official Documentation:** [`https://docs.seevcash.com`](https://docs.seevcash.com)  

---

## 1. Executive Summary

This document presents technical findings from direct inspection of SeevCash's live Stellar anchor (`anchor.seevcash.com`), its official documentation (`docs.seevcash.com/docs/seevanchor`), and live API responses across SEP-1, SEP-6, SEP-10, SEP-12, SEP-24, and SEP-38.

### Key Answers at a Glance
- **Does a MoMo-to-USDC DEPOSIT exist for sender funding?**  
  **Yes.** Both SEP-6 `/info` and SEP-24 support deposits from Mobile Money (`funding_methods: ["mobile", "bank_account", "cash"]`). Senders can deposit GHS via MTN MoMo, Telecel (Vodafone) Cash, or AirtelTigo Money to receive USDC.
- **Do they accept Soroban token transfers or only classic payments with memo?**  
  **Classic payments with memo only.** SeevCash withdrawal requires an incoming payment to the anchor's distribution account with a transaction memo (`memo_type: id` or `text`) to attribute the payout to the user's transaction ID. Direct Soroban SAC invocations do not include classic Stellar transaction memos and will fail attribution unless processed through a dedicated bridge or classic payment.
- **Is bank payout available?**  
  **Not in production (Coming Soon).** While SEP-6 `/info` specifies a schema for `bank_account` with `dest` (account number) and `dest_extra` (routing/sort code), the official SeevCash payment matrix explicitly marks Bank Transfer as **"🚧 Coming Soon"**. Mobile Money is the primary and live settlement rail.

---

## 2. SEP-1: `stellar.toml` Discovery

- **Live URL:** [`https://anchor.seevcash.com/.well-known/stellar.toml`](https://anchor.seevcash.com/.well-known/stellar.toml)
- **Network:** Stellar Testnet

### Live Contents
```toml
# Stellar TOML for anchor.seevcash.com
# Network: TESTNET
# Auto-generated from environment configuration

NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"

TRANSFER_SERVER = "https://anchor.seevcash.com/sep6"
TRANSFER_SERVER_SEP0024 = "https://anchor.seevcash.com"
WEB_AUTH_ENDPOINT = "https://anchor.seevcash.com/auth"
KYC_SERVER = "https://anchor.seevcash.com/sep12"
DIRECT_PAYMENT_SERVER = "https://anchor.seevcash.com/sep31"
ANCHOR_QUOTE_SERVER = "https://anchor.seevcash.com/sep38"
SIGNING_KEY = "GA2E5D24D2LCGVA3SVVKDP64OTN2M2NLUWRDYINB352HW35ABZ66MPVR"

[[CURRENCIES]]
code = "USDC"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
display_decimals = 2
name = "USD Coin"
desc = "USD Coin issued by Circle"
is_asset_anchored = true
anchor_asset_type = "fiat"
anchor_asset = "USD"
status = "live"

[DOCUMENTATION]
ORG_NAME = "SeevCash"
ORG_URL = "https://seevcash.com"
ORG_DESCRIPTION = "SeevCash Stellar Anchor - Mobile Money to USDC bridge"
```

### Analysis
- **Issuer Account:** `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (Standard Circle Testnet USDC).
- **Signing Key:** `GA2E5D24D2LCGVA3SVVKDP64OTN2M2NLUWRDYINB352HW35ABZ66MPVR` (Used to sign SEP-10 challenge transactions).
- **Supported Standards:** SEP-6 (programmatic transfer), SEP-10 (auth), SEP-12 (KYC), SEP-24 (hosted interactive transfer), SEP-31 (direct payment), SEP-38 (RFQs and quotes).

---

## 3. SEP-10: Web Authentication Specifics

- **Endpoint:** `GET/POST https://anchor.seevcash.com/auth`
- **Documentation:** [`https://docs.seevcash.com/docs/seevanchor#step-1-sep-10-authentication`](https://docs.seevcash.com/docs/seevanchor#step-1-sep-10-authentication)

### Authentication Flow
1. **Challenge Request:** Client calls `GET https://anchor.seevcash.com/auth?account=<STELLAR_PUBLIC_KEY>`.
2. **Challenge Transaction Verification:**
   - Transaction envelope contains a manage data operation with key `anchor.seevcash.com auth`.
   - Transaction source account matches the anchor's `SIGNING_KEY` (`GA2E5D...MPVR`).
   - Time bounds are enforced (typically 5-minute validity window).
   - Sequence number is 0.
   - `web_auth_domain` is validated against `anchor.seevcash.com`.
3. **Sign & Submit:** Client signs the challenge transaction with the account's Stellar secret key and POSTs to `/auth`:
   ```json
   { "transaction": "<SIGNED_ENVELOPE_XDR>" }
   ```
4. **JWT Issuance & Expiration:**
   - Anchor returns `{ "token": "eyJhbG..." }`.
   - **Token Lifetime:** Exactly **15 minutes** (900 seconds).
   - Clients must cache the token and refresh it proactively (e.g., at 13 minutes) or upon receiving a 401 response.

---

## 4. SEP-12: KYC Requirements, Customer Fields, and Tiers

- **Endpoint:** `https://anchor.seevcash.com/sep12` (or direct `/customer` under auth)
- **Documentation:** [`https://docs.seevcash.com/docs/seevanchor#step-2-create-customer-put-customer`](https://docs.seevcash.com/docs/seevanchor#step-2-create-customer-put-customer)

### Customer Fields
SeevCash requires the following fields for Tier-1 individual identity verification:
| Field Name | Type | Description | Required |
| :--- | :--- | :--- | :---: |
| `first_name` | `string` | Legal given/first name | Yes |
| `last_name` | `string` | Legal family/last name | Yes |
| `email_address` | `string` | Valid email address | Yes |
| `birth_date` | `date` | Date of birth formatted as `YYYY-MM-DD` | Yes |
| `address` | `string` | Residential street address | Yes |
| `city` | `string` | City of residence (e.g. Accra, Kumasi) | Yes |
| `address_country_code` | `string` | ISO 3166-1 alpha-3 code (e.g. `GHA`) | Yes |
| `mobile_number` | `string` | Canonical E.164 phone number (e.g. `+233244123456`) | Yes |

### Customer Status Lifecycle
- `NEEDS_INFO`: Initial status when required fields are missing; response includes a `fields` map indicating what must be supplied.
- `PROCESSING`: KYC documentation is being validated.
- `ACCEPTED`: Customer is verified and eligible to transact up to tier limits.
- `REJECTED`: Customer KYC failed or account is sanctioned.

### KYC Tiers & Limits
- **Starter Tier:** Up to **$100,000 monthly volume** per organization; single transaction limit of **10,000 USDC**.
- **Per-Transaction Limits:**
  - Minimum: **0.1 USDC**
  - Maximum: **10,000 USDC**

---

## 5. SEP-38: Price Discovery & Quotes

- **Endpoints:**
  - Info: `GET https://anchor.seevcash.com/sep38/info`
  - Prices: `GET https://anchor.seevcash.com/sep38/prices`
  - Quote: `POST https://anchor.seevcash.com/sep38/quote`
- **Documentation:** [`https://docs.seevcash.com/docs/seevanchor`](https://docs.seevcash.com/docs/seevanchor)

### Live Asset Pairs & Delivery Methods
```json
{
  "assets": [
    { "asset": "stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
    { "asset": "stellar:native" },
    {
      "asset": "iso4217:GHS",
      "country_codes": ["GH"],
      "sell_delivery_methods": [
        { "name": "bank_transfer", "description": "Bank transfer to anchor account" },
        { "name": "mobile_money", "description": "Mobile money transfer" }
      ],
      "buy_delivery_methods": [
        { "name": "bank_transfer", "description": "Bank transfer to your account" },
        { "name": "mobile_money", "description": "Mobile money to your wallet" }
      ]
    },
    { "asset": "iso4217:USD", "country_codes": ["US"] }
  ]
}
```

### Live Testnet Exchange Rates
- `sell_asset=stellar:USDC:...`: Returns `1 GHS = 0.0714 USDC` (effective rate **~14.00 GHS per 1 USDC**).
- `sell_asset=iso4217:GHS`: Returns `1 USDC = 14.00 GHS`.
- **Quote Expiration:** Quotes generated via `POST /sep38/quote` carry a fixed `expires_at` timestamp (typically **30 to 60 seconds**). Expired quotes return `QUOTE_EXPIRED` (HTTP 422).

---

## 6. SEP-6: Deposit, Withdraw, and Mobile Money Parameters

- **Info Endpoint:** `GET https://anchor.seevcash.com/sep6/info`
- **Deposit Endpoint:** `GET https://anchor.seevcash.com/sep6/deposit`
- **Withdraw Endpoint:** `GET https://anchor.seevcash.com/sep6/withdraw`

### Live `/info` Response Breakdown
```json
{
  "deposit": {
    "USDC": {
      "enabled": true,
      "authentication_required": true,
      "min_amount": 0.1,
      "max_amount": 10000,
      "fee_fixed": 0,
      "fee_percent": 1.5,
      "funding_methods": ["bank_account", "mobile", "cash"]
    }
  },
  "withdraw": {
    "USDC": {
      "enabled": true,
      "authentication_required": true,
      "min_amount": 0.1,
      "max_amount": 10000,
      "fee_fixed": 0,
      "fee_percent": 1.5,
      "types": {
        "mobile": {
          "fields": {
            "dest": {
              "description": "Mobile money phone number",
              "optional": false
            },
            "dest_extra": {
              "description": "Mobile money provider (e.g. MTN, Vodafone, AirtelTigo)",
              "optional": false
            }
          }
        },
        "bank_account": {
          "fields": {
            "dest": { "description": "Bank account number", "optional": false },
            "dest_extra": { "description": "Bank routing number", "optional": true }
          }
        }
      },
      "funding_methods": ["bank_account", "mobile", "cash"]
    }
  }
}
```

### Parameters for Mobile Money Payout (Withdraw)
When calling `GET https://anchor.seevcash.com/sep6/withdraw`:
- `type`: Must be `"mobile"`.
- `asset_code`: `"USDC"`.
- `dest`: Mobile money phone number (Ghana E.164, e.g. `+233241234567`).
- `dest_extra`: Mobile network operator name. Must match one of:
  - `MTN` (MTN Ghana Mobile Money)
  - `Vodafone` / `Telecel` (Telecel Cash, formerly Vodafone Cash)
  - `AirtelTigo` (AT Money)
- `amount`: Payout amount in USDC.
- `account`: Destination Stellar account (or caller's account).

### Parameters for Mobile Money Deposit (Funding)
When calling `GET https://anchor.seevcash.com/sep6/deposit`:
- `asset_code`: `"USDC"`.
- `account`: Destination Stellar address to receive the minted/transferred USDC.
- `amount`: Optional amount.

---

## 7. Fees, Limits, and Settlement Times

| Parameter | Value | Source / Notes |
| :--- | :--- | :--- |
| **Platform Fee** | **1.5%** (`fee_percent: 1.5`, `fee_fixed: 0`) | Documented in SEP-6 `/info` and Checkout API |
| **Max Checkout Fee Cap**| **GH₵ 50.00** | Documented on SeevPlus pricing page |
| **Min Amount** | **0.1 USDC** | Enforced in SEP-6 `/info` |
| **Max Amount** | **10,000 USDC** | Enforced in SEP-6 `/info` |
| **Buy (Deposit) Speed** | **1–4 minutes** | USSD prompt approval -> USDC mint on Stellar |
| **Sell (Withdraw) Speed**| **1–5 minutes** | USDC received on Stellar -> Mobile Money disbursement |

---

## 8. Webhook Format, Events, and Signature Verification

- **Documentation:** [`https://docs.seevcash.com/docs/seevanchor#webhooks`](https://docs.seevcash.com/docs/seevanchor#webhooks)

### Headers
- `X-Webhook-Signature`: Hex-encoded HMAC-SHA256 signature of the raw request body using the merchant's `webhook_secret`.
- `X-Webhook-Timestamp`: Unix timestamp of dispatch.

### Event Types
- `order.completed`: Crypto delivered (deposit) or Mobile Money paid out (withdraw).
- `order.failed`: Transaction failed, rejected by carrier, or invalid recipient account.
- `order.expired`: Payment window timed out before user interaction.

### Payload Schema
```json
{
  "event": "order.completed",
  "order_id": "ord_abc123",
  "type": "offramp",
  "fiat_amount": "100.00",
  "fiat_currency": "GHS",
  "crypto_amount": "7.14",
  "crypto_currency": "USDC",
  "destination_address": "+233241234567",
  "timestamp": "2026-10-04T12:00:00Z"
}
```

### Retry Policy
5 exponential retries on non-2xx responses:
1. Immediate
2. 10 seconds
3. 1 minute
4. 1 hour
5. 4 hours (exhausted thereafter)

---

## 9. Account Name-Lookup Analysis

- **Does SeevCash offer a pre-flight account name lookup endpoint?**  
  **No.** The public SeevCash Anchor and widget APIs do not expose a standalone Bank/MoMo account name lookup endpoint (e.g. `GET /momo/validate?phone=...`).
- **Validation Mechanism:** SeevCash verifies phone numbers using SMS/USSD OTP verification and relies on carrier network validation at disbursement time.
- **Cheque Protocol Impact:** Our Cheque claim flow should treat payee name matching as a post-claim fraud/audit check rather than a pre-flight blocking check unless integrated with an aggregator like Hubtel that provides explicit name-lookup services.

---

## 10. Soroban Token Transfers vs. Classic Payments with Memo

- **Finding:** SeevCash's anchor uses **classic Stellar payments with memo** to attribute incoming transactions to SEP-6/24 off-ramps:
  ```
  Customer sends USDC to anchor address (e.g. GA2E5D...) with memo: <TRANSACTION_ID>
  ```
- **Soroban Invocations:** Direct contract invocations on Soroban (`invoke_contract` for `token.transfer`) emit smart contract events rather than classic transaction memo fields.
- **Architectural Solution:**
  1. The cheque smart contract releases USDC to our backend settlement account (`SETTLEMENT_ACCOUNT_PUBLIC`).
  2. The settlement worker executes a classic Stellar `PaymentOp` transferring USDC from `SETTLEMENT_ACCOUNT_PUBLIC` to the anchor's distribution address, with the anchor's required `memo` and `memo_type`.
  3. This ensures 100% compatibility with standard Stellar anchors.

---

## 11. Alternatives for Licensed Ghana MoMo Collection & Payout

While SeevCash supports both on-ramp and off-ramp, having a direct licensed Ghana MoMo partner provides redundancy, fee optimization, and direct name-lookups.

| Provider | BoG License Status | Mobile Money Channels | Name Lookup API | Fees | API Readiness |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Hubtel** | Licensed Dedicated Electronic Money Issuer (DEMI) / Enhanced PSP | MTN, Telecel, AirtelTigo | **Yes** (Instant account name verification) | ~1.0% - 1.5% (capped) | REST APIs, Webhooks, Sandbox |
| **Paystack (Stripe)** | Licensed Enhanced Payment Service Provider (EPSP) | MTN, Telecel, AirtelTigo | **Yes** (Resolve Account Number) | ~1.95% | Robust Webhook & Checkout APIs |
| **Flutterwave** | Licensed Enhanced Payment Service Provider (EPSP) | MTN, Telecel, AirtelTigo | **Yes** | ~1.4% - 2.0% | REST API, Collections & Transfers |

**Recommendation:**
- Use **SeevCash** as the primary Stellar-native USDC on/off-ramp anchor.
- Keep **Hubtel** as a secondary fallback for direct local collections and recipient name-verification.

---

## 12. Open Questions for SeevCash Team

1. **Soroban Native Support:** Does SeevCash have a Soroban contract address or listener that accepts contract transfer events directly, or is classic Stellar payment with memo the permanent requirement?
2. **Programmatic SEP-6 Deposit Flow:** For sender funding without an iframe widget, can the anchor trigger a direct network prompt (STK push / USSD prompt) via a server-to-server SEP-6 request?
3. **Name Lookup Access:** Is recipient MoMo account name verification exposed as a private endpoint for business tier merchants?
4. **Mainnet Production Timeline for Bank Payouts:** When is the `bank_transfer` payout rail expected to move from "Coming Soon" to live production status?
5. **Rate Limits on Sandbox & Production:** What are the exact request rate limits on `/auth`, `/sep38/prices`, and `/sep6/withdraw`?
