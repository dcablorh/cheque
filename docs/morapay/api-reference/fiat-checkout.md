> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Fiat checkout API

> REST endpoints for MoMo, bank transfer, and card checkout configuration.

Fiat payment methods at checkout are configured per environment. Use these endpoints to discover enabled rails, quote payer totals, initialize sessions, and verify status.

Base URL: `https://api.morapay.io`

## Endpoints

| Method | Path | Auth | Description |
| - | - | - | - |
| `GET` | `/api/public/fiat/config` | None | Enabled fiat methods (proxies to Core `/api/commerce/fiat-checkout/config`) |
| `POST` | `/api/public/fiat/payments/initialize` | None | Start MoMo, bank, or card session |
| `GET` | `/api/public/fiat/transactions/verify/:reference` | None | Poll payment status |
| `POST` | `/api/public/fiat/payments/test-confirm` | None | TEST mode only: simulate success |
| `POST` | `/api/public/commerce/fiat` | None | Quote payer fiat total (proxies to Core `/api/commerce/checkout-fiat`) |
| `POST` | `/api/public/validate/momo` | None | Validate MoMo number |
| `POST` | `/api/public/validate/bank` | None | Validate bank account |
| `GET` | `/api/public/validate/banks` | None | Bank list for forms |

## Checkout config

`GET /api/public/fiat/config`

Returns enabled fiat methods for TEST or LIVE checkout. On Core this route is registered as `GET /api/commerce/fiat-checkout/config`.

### Query parameters

| Parameter | Type | Description |
| - | - | - |
| `environment` | string | `TEST` or `LIVE` (default `LIVE`) |

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/public/fiat/config?environment=LIVE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "environment": "LIVE",
    "methods": [
      {
        "id": "mobile_money",
        "provider": "moolre",
        "enabled": true,
        "currencies": ["GHS", "NGN"]
      },
      {
        "id": "bank_transfer",
        "provider": "moolre",
        "enabled": true,
        "currencies": ["GHS", "NGN"]
      },
      {
        "id": "card",
        "provider": "paystack",
        "enabled": true,
        "currencies": ["GHS", "NGN"],
        "channels": ["card"]
      }
    ]
  }
}
```

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "Invalid environment query.",
  "code": "request.invalid",
  "requestId": "req_fiat_cfg400"
}
```

## Commerce fiat quote

`POST /api/public/commerce/fiat`

Quote fiat checkout amounts for a payment link or product session. Proxies to Core `POST /api/commerce/checkout-fiat`.

> [!NOTE]
>
> Legacy Core alias: `POST /api/commerce/paystack-fiat-quote`. Do not use `/api/public/catalog/quotes/checkout` for fiat payer totals.

| Field | Type | Required | Description |
| - | - | - | - |
| `payment_link_id` | uuid | One of | Link id |
| `product_id` | uuid | One of | Product id |
| `payer_currency` | string | Yes | e.g. `GHS`, `NGN` |
| `quote_tier` | string | Yes | `mobile_money`, `bank_transfer`, `card_local`, `card_international` |
| `invoice_major` | number | No | Override invoice amount |

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/public/commerce/fiat" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_link_id": "link_uuid",
    "payer_currency": "GHS",
    "quote_tier": "mobile_money",
    "invoice_major": 100
  }'
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "payerCurrency": "GHS",
    "payerAmountMajor": "1250.00",
    "quoteTier": "mobile_money",
    "expiresAt": "2026-03-01T12:05:00.000Z"
  }
}
```

```json 422 Unprocessable Entity theme={null}
{
  "success": false,
  "error": "Fiat rail is not enabled for this currency.",
  "code": "request.validation_failed",
  "requestId": "req_commerce422"
}
```

## Initialize fiat payment

`POST /api/public/fiat/payments/initialize`

Starts a MoMo, bank transfer, or card session for an existing transaction.

| Field | Type | Required | Description |
| - | - | - | - |
| `transaction_id` | string | Yes | Morapay transaction id |
| `payment_method` | string | Yes | `mobile_money`, `bank_transfer`, or `card` |
| `phone` | string | MoMo | E.164 or local format |
| `provider` | string | MoMo | e.g. `MTN`, `VOD` |
| `bank_code` | string | Bank | Institution code |
| `account_number` | string | Bank | Payer account |

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/public/fiat/payments/initialize" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "txn_abc123",
    "payment_method": "mobile_money",
    "phone": "233241234567",
    "provider": "MTN"
  }'
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "reference": "fiat_ref_xyz",
    "status": "PENDING",
    "authorizationUrl": null,
    "ussdCode": "*170#"
  }
}
```

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "Transaction is not payable.",
  "code": "request.invalid",
  "requestId": "req_init400"
}
```

```json 422 Unprocessable Entity theme={null}
{
  "success": false,
  "error": "Mobile money number could not be validated.",
  "code": "payouts.momo.account_not_found",
  "requestId": "req_init422"
}
```

## Verify fiat payment

`GET /api/public/fiat/transactions/verify/:reference`

Poll payment status after the payer completes MoMo, bank, or card checkout.

| Query | Description |
| - | - |
| `payment_method` | Same method used at initialize |

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/public/fiat/transactions/verify/fiat_ref_xyz?payment_method=mobile_money"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "reference": "fiat_ref_xyz",
    "status": "COMPLETED",
    "transactionId": "txn_abc123"
  }
}
```

```json 404 Not Found theme={null}
{
  "success": false,
  "error": "Payment reference not found.",
  "code": "resource.not_found",
  "requestId": "req_verify404"
}
```

## MoMo and bank validation

Validate numbers before checkout:

```bash theme={null}
curl -s -X POST "https://api.morapay.io/api/public/validate/momo" \
  -H "Content-Type: application/json" \
  -d '{ "receiver": "233241234567", "provider": "MTN", "currency": "GHS" }'
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "valid": true,
    "accountName": "JOHN DOE"
  }
}
```

```json 422 Unprocessable Entity theme={null}
{
  "success": false,
  "error": "Could not resolve mobile money account.",
  "code": "payouts.momo.account_not_found",
  "requestId": "req_momo422"
}
```

Bank list for checkout forms: `GET /api/public/validate/banks?country=gha` (`gha` or `nga`).

## Supported fiat currencies

| Currency | MoMo | Virtual bank | Card |
| - | - | - | - |
| **GHS** | Yes | Yes | Yes |
| **NGN** | Yes | Yes | Yes |

International on/offramp corridors use additional countries at quote time. See [Countries & fiat](https://docs.morapay.io/reference/countries-and-fiat.md).

## MoMo operators

Ghana GHS: **MTN**, **Telecel**, **AirtelTigo**

## Related

* [Public checkout](https://docs.morapay.io/api-reference/public-checkout.md)
* [Catalog API](https://docs.morapay.io/api-reference/catalog.md)
* [Countries & fiat reference](https://docs.morapay.io/reference/countries-and-fiat.md)
* [Payment links](https://docs.morapay.io/concepts/payment-links.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.