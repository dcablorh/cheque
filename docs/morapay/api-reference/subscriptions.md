> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Subscriptions

> Plans, enrollments, billing settings, and subscription checkout.

Subscriptions cover recurring billing: plans, subscriber enrollments, imports, and account balances.

Base path: `/api/v1/merchant/subscriptions`

## Endpoints

| Method | Path | Description |
| - | - | - |
| `GET` | `/subscriptions/plans` | List plans |
| `POST` | `/subscriptions/plans` | Create plan |
| `GET` | `/subscriptions/plans/:id` | Get plan |
| `PATCH` | `/subscriptions/plans/:id` | Update plan |
| `GET` | `/subscriptions` | List enrollments |
| `POST` | `/subscriptions` | Create enrollment |
| `GET` | `/subscriptions/:id` | Get enrollment |
| `POST` | `/subscriptions/:id/pause` | Pause billing |
| `POST` | `/subscriptions/:id/cancel` | Cancel subscription |
| `GET` | `/subscriptions/settings` | Billing settings |
| `PATCH` | `/subscriptions/settings` | Update billing settings |
| `GET` | `/subscriptions/account` | Subscription treasury account |
| `GET` | `/subscriptions/stats` | Subscription metrics |

Public checkout for subscribers uses the checkout host at `/subscription/:planId` without merchant keys. See [Public checkout](https://docs.morapay.io/api-reference/public-checkout.md).

## Plans

### List plans

`GET /api/v1/merchant/subscriptions/plans`

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/v1/merchant/subscriptions/plans" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": [
    {
      "id": "plan_uuid",
      "name": "Pro monthly",
      "amount": 29,
      "currency": "USD",
      "interval": "month",
      "isActive": true
    }
  ]
}
```

### Create plan

`POST /api/v1/merchant/subscriptions/plans`

Typical body fields: `name`, `amount`, `currency`, `interval`, `intervalCount`, `trialDays`, `metadata`.

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/subscriptions/plans" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{
    "name": "Pro monthly",
    "amount": 29,
    "currency": "USD",
    "interval": "month"
  }'
```

```json 201 Created theme={null}
{
  "success": true,
  "data": {
    "id": "plan_uuid",
    "name": "Pro monthly",
    "amount": 29,
    "currency": "USD",
    "interval": "month",
    "isActive": true
  }
}
```

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "Amount is below the platform minimum.",
  "code": "links.amount.below_minimum",
  "requestId": "req_sub_min"
}
```

```json 403 Forbidden theme={null}
{
  "success": false,
  "error": "Complete KYB before creating LIVE subscription plans.",
  "code": "kyb.forbidden",
  "requestId": "req_sub403"
}
```

### Update plan

`PATCH /api/v1/merchant/subscriptions/plans/:id`

```bash cURL theme={null}
curl -s -X PATCH "https://api.morapay.io/api/v1/merchant/subscriptions/plans/plan_uuid" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{ "isActive": false }'
```

## Enrollments

### List

`GET /api/v1/merchant/subscriptions?status=ACTIVE`

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/v1/merchant/subscriptions?status=ACTIVE" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

### Get

`GET /api/v1/merchant/subscriptions/:id`

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "id": "sub_uuid",
    "planId": "plan_uuid",
    "status": "ACTIVE",
    "customerEmail": "buyer@example.com"
  }
}
```

```json 404 Not Found theme={null}
{
  "success": false,
  "error": "Subscription not found.",
  "code": "resource.not_found",
  "requestId": "req_sub404"
}
```

### Lifecycle

| Action | Method | Path |
| - | - | - |
| Pause | `POST` | `/subscriptions/:id/pause` |
| Cancel | `POST` | `/subscriptions/:id/cancel` |

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/subscriptions/sub_uuid/cancel" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": { "cancelled": true }
}
```

```json 409 Conflict theme={null}
{
  "success": false,
  "error": "Subscription is already canceled.",
  "code": "resource.conflict",
  "requestId": "req_sub409"
}
```

## Settings and account

`GET` and `PATCH /subscriptions/settings` control fee pass-through, tax calculation flags, and billing behavior.

`GET /subscriptions/account` returns balances for subscription treasury operations.

## Common errors

| Code | HTTP | Cause |
| - | - | - |
| `links.amount.below_minimum` | 400 | Plan amount too low |
| `resource.not_found` | 404 | Unknown plan or enrollment |
| `resource.conflict` | 409 | Invalid state transition |
| `kyb.forbidden` | 403 | LIVE blocked by KYB |
| `auth.signature.mismatch` | 401 | Invalid signed request |

## Related

* [Subscriptions concept](https://docs.morapay.io/concepts/subscriptions.md)
* [Public checkout](https://docs.morapay.io/api-reference/public-checkout.md)
* [Webhooks API](https://docs.morapay.io/api-reference/webhooks.md)
* [Fees reference](https://docs.morapay.io/reference/fees-countries-taxes.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.