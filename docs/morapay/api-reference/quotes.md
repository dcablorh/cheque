> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Quotes

> Ramp, fiat, and checkout quotes before committing funds.

Quote endpoints return exact fees and settlement amounts before you create links, batches, or custom checkout UI.

## Merchant quotes

Base path: `/api/v1/merchant`

| Method | Path | Description |
| - | - | - |
| `POST` | `/quotes/ramp` | Crypto onramp or offramp quote |
| `POST` | `/quotes/fiat` | Fiat corridor quote |

### Ramp quote (crypto assets)

`POST /api/v1/merchant/quotes/ramp`

For **fiat onramp and offramp**, use the dedicated [Merchant ramp](https://docs.morapay.io/api-reference/merchant-ramp.md) API instead.

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/quotes/ramp" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{
    "action": "buy",
    "sourceAsset": "USDC",
    "targetAsset": "ETH",
    "targetChain": "1",
    "amount": 100,
    "amountType": "source"
  }'
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "quoteId": "quote_uuid",
    "sourceAmount": "100",
    "targetAmount": "0.042",
    "expiresAt": "2026-03-01T12:05:00.000Z"
  }
}
```

```json 401 Unauthorized theme={null}
{
  "success": false,
  "error": "Invalid request signature.",
  "code": "auth.signature.mismatch",
  "requestId": "req_ramp401"
}
```

```json 422 Unprocessable Entity theme={null}
{
  "success": false,
  "error": "Token ETH is not supported on chain 1 in TEST mode.",
  "code": "crypto.unsupported_token",
  "requestId": "req_ramp422"
}
```

### Fiat quote

`POST /api/v1/merchant/quotes/fiat`

Returns corridor pricing for fiat legs used in custom integrations.

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/quotes/fiat" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{
    "from": "USD",
    "to": "GHS",
    "amount": 100,
    "purpose": "spot"
  }'
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "from": "USD",
    "to": "GHS",
    "rate": "12.45",
    "amountOut": "1245.00"
  }
}
```

```json 422 Unprocessable Entity theme={null}
{
  "success": false,
  "error": "Corridor not supported.",
  "code": "request.validation_failed",
  "requestId": "req_fiat422"
}
```

## Commerce fiat quote

`POST /api/public/commerce/fiat`

Proxies to Core `POST /api/commerce/checkout-fiat`. Use this path from checkout BFFs and hosted flows.

> [!NOTE]
>
> Legacy Core alias: `POST /api/commerce/paystack-fiat-quote` (same handler, not exposed on the public API host).

| Field | Description |
| - | - |
| `payment_link_id` | Link uuid |
| `payer_currency` | Payer fiat currency |
| `quote_tier` | `mobile_money`, `bank_transfer`, `card_local`, `card_international` |
| `invoice_major` | Optional invoice override |

See [Fiat checkout API](https://docs.morapay.io/api-reference/fiat-checkout.md).

## Link quote

`POST /api/v1/merchant/links/:id/quote`

Merchant clearing estimate for fiat-denominated links.

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/links/link_uuid/quote" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{ "invoice_major": 100 }'
```

## Checkout catalog quote

`POST /api/v1/quotes/checkout`

Returns token payout rows for custom checkout UIs.

| Host | Path |
| - | - |
| Morapay API (public) | `POST /api/public/quotes/checkout` |
| Core (direct) | `POST /api/v1/quotes/checkout` |

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/quotes/checkout" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{
    "inputAmount": "100",
    "inputCurrency": "USD",
    "environment": "LIVE"
  }'
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "rows": [
      {
        "tokenSymbol": "USDC",
        "chainId": "8453",
        "payoutAmount": "99.50"
      }
    ]
  }
}
```

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "inputAmount is required.",
  "code": "request.invalid",
  "requestId": "req_checkout400"
}
```

## Related

* [Payment links API](https://docs.morapay.io/api-reference/payment-links.md)
* [Disbursement API](https://docs.morapay.io/api-reference/disbursement.md)
* [Fiat checkout API](https://docs.morapay.io/api-reference/fiat-checkout.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.