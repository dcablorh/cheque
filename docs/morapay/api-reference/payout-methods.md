> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Payout methods

> Save and manage MoMo and bank accounts for withdrawals.

Payout methods are the saved destinations for clearing-balance withdrawals. Use [Payout rails](https://docs.morapay.io/api-reference/payout-rails.md) first to list banks, MoMo operators, and resolve account names.

Base path: `/api/v1/merchant/methods`

## Endpoints

| Method | Path | Description |
| - | - | - |
| `GET` | `/methods` | List active payout methods |
| `POST` | `/methods` | Add MoMo or bank account |
| `PATCH` | `/methods/:id` | Update label or primary flag |

Portal users need **OWNER**, **ADMIN**, or **FINANCE** role for mutating routes. Merchant API keys have full access.

## List methods

`GET /api/v1/merchant/methods`

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/v1/merchant/methods" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": [
    {
      "id": "pm_uuid",
      "type": "MOBILE_MONEY",
      "label": "MTN MoMo",
      "isPrimary": true,
      "currency": "GHS",
      "details": {
        "phone": "233241234567",
        "provider": "MTN",
        "accountName": "JOHN DOE"
      }
    }
  ]
}
```

```json 401 Unauthorized theme={null}
{
  "success": false,
  "error": "Invalid request signature.",
  "code": "auth.signature.mismatch",
  "requestId": "req_methods401"
}
```

## Create method

`POST /api/v1/merchant/methods`

| Field | Type | Required | Description |
| - | - | - | - |
| `type` | string | Yes | `BANK_ACCOUNT` or `MOBILE_MONEY` |
| `label` | string | No | Friendly name |
| `isPrimary` | boolean | No | Set as default withdrawal destination |
| `details` | object | Yes | Bank or MoMo fields from rails resolve |

Example MoMo body:

```json theme={null}
{
  "type": "MOBILE_MONEY",
  "label": "MTN MoMo",
  "isPrimary": true,
  "details": {
    "phone": "233241234567",
    "provider": "MTN",
    "accountName": "JOHN DOE"
  }
}
```

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/methods" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{
    "type": "MOBILE_MONEY",
    "label": "MTN MoMo",
    "isPrimary": true,
    "details": {
      "phone": "233241234567",
      "provider": "MTN",
      "accountName": "JOHN DOE"
    }
  }'
```

```json 201 Created theme={null}
{
  "success": true,
  "data": {
    "id": "pm_uuid",
    "type": "MOBILE_MONEY",
    "isPrimary": true
  }
}
```

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "Bank and Mobile Money payouts are not available for your region.",
  "code": "request.invalid",
  "requestId": "req_methods_region"
}
```

```json 422 Unprocessable Entity theme={null}
{
  "success": false,
  "error": "Account name could not be verified.",
  "code": "payouts.momo.account_not_found",
  "requestId": "req_methods422"
}
```

## Update method

`PATCH /api/v1/merchant/methods/:id`

Update `label`, `isPrimary`, or deactivate with `{ "isActive": false }`.

## Withdraw to a method

After saving a method, call `POST /api/v1/merchant/settlements/withdraw` with `payoutMethodId`. See [Transactions](https://docs.morapay.io/api-reference/transactions.md#settlements-and-withdrawals).

## Related

* [Payout rails](https://docs.morapay.io/api-reference/payout-rails.md)
* [Transactions](https://docs.morapay.io/api-reference/transactions.md)
* [Banks & MoMo reference](https://docs.morapay.io/reference/banks-and-momo.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.