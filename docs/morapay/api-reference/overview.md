> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# API overview

> Morapay REST API base URL, authentication, endpoint index, and response envelope.

The **Morapay API** is the public HTTP surface for merchant integrations. Production base URL: `https://api.morapay.io`.

## API families

| Family | Base path | Auth |
| - | - | - |
| **Merchant API v1** | `/api/v1/merchant` | HMAC signed headers |
| **Public catalog and checkout** | `/api/public` | Mostly unsigned |
| **V1 quotes** | `/api/v1/quotes` | Varies by route |

## Discover Merchant API v1

```bash theme={null}
curl -s https://api.morapay.io/api/v1/merchant
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "version": "v1",
    "description": "Morapay merchant integration API",
    "resources": {
      "links": "/api/v1/merchant/links",
      "products": "/api/v1/merchant/products",
      "webhooks": "/api/v1/merchant/webhooks/endpoints",
      "disbursement": "/api/v1/merchant/disbursement"
    }
  }
}
```

## Endpoint index

### Payments and catalog

| Resource | Methods | Doc |
| - | - | - |
| Payment links | `GET`, `POST`, `PATCH` | [Payment links](https://docs.morapay.io/api-reference/payment-links.md) |
| Payment requests | `GET`, `POST` | [Business QR](https://docs.morapay.io/api-reference/business-qr.md) |
| Products | `GET`, `POST`, `PATCH` | [Products](https://docs.morapay.io/api-reference/products.md) |
| Business QR / pay | `GET`, `POST` | [Business QR](https://docs.morapay.io/api-reference/business-qr.md) |
| Quotes | `POST` | [Quotes](https://docs.morapay.io/api-reference/quotes.md) |

### Transfers and payouts

| Resource | Methods | Doc |
| - | - | - |
| Merchant ramp | `GET`, `POST` | [Merchant ramp](https://docs.morapay.io/api-reference/merchant-ramp.md) |
| Transactions | `GET` | [Transactions](https://docs.morapay.io/api-reference/transactions.md) |
| Refunds | `POST` | [Transactions](https://docs.morapay.io/api-reference/transactions.md#refund) |
| Settlements / withdraw | `GET`, `POST` | [Transactions](https://docs.morapay.io/api-reference/transactions.md) |
| Payout methods | `GET`, `POST`, `PATCH` | [Payout methods](https://docs.morapay.io/api-reference/payout-methods.md) |
| Disbursement batches | `GET`, `POST`, `DELETE` | [Disbursement](https://docs.morapay.io/api-reference/disbursement.md) |
| Payout rails | `GET` | [Payout rails](https://docs.morapay.io/api-reference/payout-rails.md) |

### Account and keys

| Resource | Methods | Doc |
| - | - | - |
| Business profile | `GET`, `PATCH` | [Business and keys](https://docs.morapay.io/api-reference/business-and-keys.md) |
| API keys | `GET`, `POST`, `PATCH`, `DELETE` | [Business and keys](https://docs.morapay.io/api-reference/business-and-keys.md) |
| Summary KPIs | `GET` | [Business and keys](https://docs.morapay.io/api-reference/business-and-keys.md) |

### Recurring and events

| Resource | Methods | Doc |
| - | - | - |
| Subscription plans | `GET`, `POST`, `PATCH` | [Subscriptions](https://docs.morapay.io/api-reference/subscriptions.md) |
| Enrollments | `GET`, `POST`, pause, cancel | [Subscriptions](https://docs.morapay.io/api-reference/subscriptions.md) |
| Webhook endpoints | `GET`, `POST`, `PATCH`, `DELETE` | [Webhooks](https://docs.morapay.io/api-reference/webhooks.md) |
| Webhook deliveries | `GET`, retry | [Webhooks](https://docs.morapay.io/api-reference/webhooks.md) |

### Public catalog and checkout

| Resource | Methods | Doc |
| - | - | - |
| Countries | `GET` | [Catalog](https://docs.morapay.io/api-reference/catalog.md) |
| Chains and tokens | `GET` | [Catalog](https://docs.morapay.io/api-reference/catalog.md) |
| Payment link lookup | `GET` | [Public checkout](https://docs.morapay.io/api-reference/public-checkout.md) |
| Subscription checkout | `GET`, `POST` | [Public checkout](https://docs.morapay.io/api-reference/public-checkout.md) |
| Fiat config | `GET` | [Fiat checkout](https://docs.morapay.io/api-reference/fiat-checkout.md) |
| Fiat initialize / verify | `POST`, `GET` | [Fiat checkout](https://docs.morapay.io/api-reference/fiat-checkout.md) |
| Commerce fiat quote | `POST` | [Fiat checkout](https://docs.morapay.io/api-reference/fiat-checkout.md) (`/api/public/commerce/fiat` → Core `/api/commerce/checkout-fiat`) |

### Portal-only

| Resource | Methods | Notes |
| - | - | - |
| Team | `GET`, `POST`, `PATCH`, `DELETE` | `/team/*` |
| CRM customers | `GET`, `POST`, `PATCH` | `/crm/customers` |
| KYC / KYB | `GET`, `POST` | Portal verification flows |
| CSV exports | `GET` | `/exports/*.csv` |

## Authentication

Every Merchant API call requires signed headers. See [Authentication](https://docs.morapay.io/getting-started/authentication.md) and [Conventions](https://docs.morapay.io/api-reference/conventions.md).

```bash theme={null}
curl -s -X GET "https://api.morapay.io/api/v1/merchant/links" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

TEST vs LIVE is determined by your key pair. Do not send `x-merchant-environment` with API keys.

## Responses and errors

Success:

```json theme={null}
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 42 } }
```

Failure responses include `code`, `displayMessage`, and `requestId`. During day-to-day integration you will commonly see **401**, **403**, **404**, **422**, and **429**.

```json 401 Unauthorized theme={null}
{
  "success": false,
  "error": "Invalid request signature.",
  "code": "auth.signature.mismatch",
  "requestId": "req_overview401"
}
```

```json 422 Unprocessable Entity theme={null}
{
  "success": false,
  "error": "Amount is below the minimum for this corridor.",
  "code": "links.amount.below_minimum",
  "requestId": "req_overview422"
}
```

See [Conventions](https://docs.morapay.io/api-reference/conventions.md) for the full status code table and error envelope.

## Coverage cross-reference

| Topic | API doc | Reference data |
| - | - | - |
| Countries and fiat | [Catalog](https://docs.morapay.io/api-reference/catalog.md) | [Countries](https://docs.morapay.io/reference/countries-and-fiat.md) |
| Chains and tokens | [Catalog](https://docs.morapay.io/api-reference/catalog.md) | [Chains](https://docs.morapay.io/reference/chains-and-tokens.md) |
| Banks and MoMo | [Payout rails](https://docs.morapay.io/api-reference/payout-rails.md) | [Banks](https://docs.morapay.io/reference/banks-and-momo.md) |
| Disbursement tokens | [Disbursement](https://docs.morapay.io/api-reference/disbursement.md) | [Tokens](https://docs.morapay.io/reference/disbursement-tokens.md) |
| Fees | [Quotes](https://docs.morapay.io/api-reference/quotes.md) | [Fees](https://docs.morapay.io/reference/fees-countries-taxes.md) |

## Client libraries

For typed helpers and automatic request signing, use the [`@morapay/sdk`](https://docs.morapay.io/getting-started/quickstart) in Guides.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.