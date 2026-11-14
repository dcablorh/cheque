> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Business and API keys

> Business profile, branding, summary KPIs, and API key management.

These endpoints manage your tenant profile and integration credentials. Base path: `/api/v1/merchant`.

Portal JWT users need the correct [business role](https://docs.morapay.io/api-reference/conventions.md#portal-rbac). Merchant API keys have full tenant access in their pinned TEST or LIVE environment.

## Endpoints

| Method | Path | Description |
| - | - | - |
| `GET` | `/business` | Business profile and branding |
| `PATCH` | `/business` | Update profile and branding |
| `PUT` | `/business/country` | Change business country (rate-limited) |
| `GET` | `/summary` | Dashboard KPIs and time series |
| `GET` | `/limits` | Platform limits for tenant |
| `GET` | `/keys` | List active API keys |
| `GET` | `/keys/:id` | Get one key |
| `POST` | `/keys` | Create key pair |
| `PATCH` | `/keys/:id` | Update name, domains, or revoke |
| `DELETE` | `/keys/:id` | Soft-revoke key |

## Business profile

### Get profile

`GET /api/v1/merchant/business`

Returns name, slug, country, KYB status, branding colors, support URLs, and portal KYC hints for dashboard users.

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/v1/merchant/business" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "id": "biz_uuid",
    "name": "Acme Ltd",
    "slug": "acme",
    "country": "GH",
    "brandColor": "#0F172A",
    "supportEmail": "billing@acme.com",
    "kybStatus": "APPROVED"
  }
}
```

```json 401 Unauthorized theme={null}
{
  "success": false,
  "error": "Invalid request signature.",
  "code": "auth.signature.mismatch",
  "requestId": "req_biz401"
}
```

### Update profile

`PATCH /api/v1/merchant/business`

| Field | Type | Description |
| - | - | - |
| `name` | string | Display name |
| `logoUrl` | string | Logo URL |
| `website` | string | Public website |
| `brandColor` | string | Hex brand color |
| `buttonColor` | string | Checkout button color |
| `supportEmail` | string | Requires email verification when changed |
| `supportUrl` | string | Help center link |
| `termsOfServiceUrl` | string | Terms URL shown at checkout |
| `returnPolicyUrl` | string | Returns policy URL |

```bash cURL theme={null}
curl -s -X PATCH "https://api.morapay.io/api/v1/merchant/business" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{ "brandColor": "#1E40AF" }'
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "id": "biz_uuid",
    "name": "Acme Ltd",
    "brandColor": "#1E40AF"
  }
}
```

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "To change your support email, request a verification code in the dashboard and enter it from your inbox.",
  "code": "SUPPORT_EMAIL_VERIFICATION_REQUIRED",
  "requestId": "req_support_email"
}
```

```json 403 Forbidden theme={null}
{
  "success": false,
  "error": "Your role or key does not allow this action.",
  "code": "FORBIDDEN_MERCHANT_ROLE",
  "requestId": "req_role403"
}
```

## Summary KPIs

`GET /api/v1/merchant/summary?days=30&seriesDays=7`

| Query | Default | Max | Description |
| - | - | - | - |
| `days` | `30` | `365` | Rolling window for counts and volume |
| `seriesDays` | `7` | `90` | Daily time series length |

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "periodDays": 30,
    "business": { "id": "biz_uuid", "name": "Acme Ltd", "kybStatus": "APPROVED" },
    "volumeUsd": "12500.00",
    "transactionCount": 42,
    "statusBreakdown": { "COMPLETED": 38, "PENDING": 4 }
  }
}
```

See also [Transactions](https://docs.morapay.io/api-reference/transactions.md) for listing individual payments.

## API keys

Keys are scoped to **TEST** or **LIVE** at creation time. The secret is shown once.

### Create key

`POST /api/v1/merchant/keys`

| Field | Type | Required | Description |
| - | - | - | - |
| `name` | string | Yes | Label for dashboard |
| `environment` | string | Yes | `TEST` or `LIVE` |
| `domains` | string\[] | No | Allowed origins; default `["*"]` |
| `permissions` | string\[] | No | Default `["*"]` for merchant keys |

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/keys" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{
    "name": "Production server",
    "environment": "LIVE"
  }'
```

```json 201 Created theme={null}
{
  "success": true,
  "data": {
    "publicKey": "pk_live_abc123",
    "secretKey": "sk_live_xyz789",
    "environment": "LIVE",
    "message": "Store the secret key securely; it will not be shown again."
  }
}
```

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "Invalid body.",
  "code": "request.invalid",
  "requestId": "req_keys400"
}
```

### Revoke key

`PATCH /api/v1/merchant/keys/:id` with body `{ "action": "revoke" }`, or `DELETE /api/v1/merchant/keys/:id`.

```json 404 Not Found theme={null}
{
  "success": false,
  "error": "API key not found.",
  "code": "resource.not_found",
  "requestId": "req_key404"
}
```

## Related

* [Authentication](https://docs.morapay.io/getting-started/authentication.md)
* [Conventions](https://docs.morapay.io/api-reference/conventions.md)
* [Transactions](https://docs.morapay.io/api-reference/transactions.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.