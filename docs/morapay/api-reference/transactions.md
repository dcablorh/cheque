> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Transactions

> List and inspect payments, settlements, and refunds.

Transactions represent completed and in-flight payments across crypto and fiat rails.

Base path: `/api/v1/merchant`

## Endpoints

| Method | Path | Description |
| - | - | - |
| `GET` | `/transactions` | List transactions |
| `GET` | `/transactions/:id` | Transaction detail |
| `POST` | `/transactions/:id/refunds` | Request refund |
| `GET` | `/settlements` | List payouts to your balance |
| `GET` | `/settlements/:id` | Settlement detail |
| `GET` | `/settlements/:id/transfer-status` | MoMo or bank transfer status |
| `POST` | `/settlements/withdraw` | Withdraw clearing balance |
| `GET` | `/summary` | Dashboard KPIs |
| `GET` | `/limits` | Platform limits for tenant |

## List transactions

`GET /api/v1/merchant/transactions`

| Query | Description |
| - | - |
| `page`, `limit` | Pagination |
| `status` | Filter by status |
| `type` | Transaction type |
| `from`, `to` | ISO date range |

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/v1/merchant/transactions?page=1&limit=20" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": [
    {
      "id": "txn_uuid",
      "type": "PAYMENT",
      "status": "COMPLETED",
      "amount": "100.00",
      "currency": "USD",
      "createdAt": "2026-03-01T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

```json 401 Unauthorized theme={null}
{
  "success": false,
  "error": "Invalid request signature.",
  "code": "auth.signature.mismatch",
  "requestId": "req_txn401"
}
```

## Get transaction

`GET /api/v1/merchant/transactions/:id`

Returns line items, fees, payer metadata, and linked payment link or subscription when present.

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/v1/merchant/transactions/txn_uuid" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "id": "txn_uuid",
    "type": "PAYMENT",
    "status": "COMPLETED",
    "amount": "100.00",
    "currency": "USD"
  }
}
```

```json 404 Not Found theme={null}
{
  "success": false,
  "error": "Transaction not found.",
  "code": "resource.not_found",
  "requestId": "req_txn404"
}
```

## Refund

`POST /api/v1/merchant/transactions/:id/refunds`

Portal users need finance role. Merchant API keys have full tenant access.

| Field | Type | Required | Description |
| - | - | - | - |
| `amount` | string / number | No | Partial refund; omit for full |
| `reason` | string | No | Internal note |

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/transactions/txn_uuid/refunds" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{ "amount": "100.00", "reason": "Customer request" }'
```

```json 202 Accepted theme={null}
{
  "success": true,
  "data": {
    "id": "refund_uuid",
    "transactionId": "txn_uuid",
    "status": "PENDING",
    "amount": "100.00"
  }
}
```

```json 403 Forbidden theme={null}
{
  "success": false,
  "error": "Your role or key does not allow this action.",
  "code": "FORBIDDEN_MERCHANT_ROLE",
  "requestId": "req_refund403"
}
```

```json 422 Unprocessable Entity theme={null}
{
  "success": false,
  "error": "Transaction is not refundable.",
  "code": "request.validation_failed",
  "requestId": "req_refund422"
}
```

## Settlements and withdrawals

`GET /api/v1/merchant/settlements` lists merchant payouts.

`POST /api/v1/merchant/settlements/withdraw` withdraws to a linked MoMo or bank account.

Withdraw body: `{ "amount", "currency", "payoutMethodId" }`.

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/settlements/withdraw" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{
    "amount": "500.00",
    "currency": "GHS",
    "payoutMethodId": "pm_uuid"
  }'
```

```json 202 Accepted theme={null}
{
  "success": true,
  "data": {
    "id": "settlement_uuid",
    "status": "PROCESSING",
    "amount": "500.00",
    "currency": "GHS"
  }
}
```

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "Insufficient clearing balance.",
  "code": "payouts.momo.insufficient_balance",
  "requestId": "req_withdraw400"
}
```

## Summary KPIs

`GET /api/v1/merchant/summary?days=30&seriesDays=7`

Returns volume, fees, status breakdowns, and time series for the resolved TEST or LIVE environment.

## Related

* [Payment links API](https://docs.morapay.io/api-reference/payment-links.md)
* [Payout methods](https://docs.morapay.io/api-reference/payout-methods.md)
* [Payout rails API](https://docs.morapay.io/api-reference/payout-rails.md)
* [Conventions](https://docs.morapay.io/api-reference/conventions.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.