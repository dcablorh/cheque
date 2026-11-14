> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Webhooks

> Register endpoints, reveal secrets, and inspect deliveries.

Webhooks notify your server when payments complete, batches dispatch, subscriptions change, and other lifecycle events occur.

Base path: `/api/v1/merchant/webhooks`

## Endpoints

| Method | Path | Description |
| - | - | - |
| `GET` | `/webhooks/endpoints` | List endpoints |
| `POST` | `/webhooks/endpoints` | Create endpoint |
| `PATCH` | `/webhooks/endpoints/:id` | Update URL or events |
| `DELETE` | `/webhooks/endpoints/:id` | Delete endpoint |
| `POST` | `/webhooks/endpoints/:id/reveal-secret` | Reveal signing secret |
| `GET` | `/webhooks/endpoints/:id/summary` | Delivery stats |
| `GET` | `/webhooks/deliveries` | List delivery attempts |
| `POST` | `/webhooks/deliveries/:id/retry` | Retry failed delivery |

## List endpoints

`GET /api/v1/merchant/webhooks/endpoints`

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/v1/merchant/webhooks/endpoints" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": [
    {
      "id": "wh_ep_uuid",
      "url": "https://api.example.com/webhooks/morapay",
      "events": ["payment_link.paid"],
      "displayName": "Production"
    }
  ]
}
```

```json 401 Unauthorized theme={null}
{
  "success": false,
  "error": "Invalid request signature.",
  "code": "auth.signature.mismatch",
  "requestId": "req_wh401"
}
```

## Create endpoint

`POST /api/v1/merchant/webhooks/endpoints`

| Field | Type | Required | Description |
| - | - | - | - |
| `url` | string | Yes | HTTPS callback URL |
| `events` | string\[] | Yes | Event types to subscribe |
| `displayName` | string | No | Dashboard label |

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/webhooks/endpoints" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{
    "url": "https://api.example.com/webhooks/morapay",
    "events": ["payment_link.paid", "payout.status_updated"]
  }'
```

```json 201 Created theme={null}
{
  "success": true,
  "data": {
    "id": "wh_ep_uuid",
    "url": "https://api.example.com/webhooks/morapay",
    "events": ["payment_link.paid", "payout.status_updated"],
    "secretHint": "whsec_...abcd"
  }
}
```

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "url must be a valid HTTPS URL.",
  "code": "request.invalid",
  "requestId": "req_wh_url"
}
```

```json 403 Forbidden theme={null}
{
  "success": false,
  "error": "Your role or key does not allow this action.",
  "code": "FORBIDDEN_MERCHANT_ROLE",
  "requestId": "req_wh403"
}
```

## Update and delete

`PATCH /api/v1/merchant/webhooks/endpoints/:id`

```bash cURL theme={null}
curl -s -X PATCH "https://api.morapay.io/api/v1/merchant/webhooks/endpoints/wh_ep_uuid" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{ "url": "https://api.example.com/v2/morapay" }'
```

`DELETE /api/v1/merchant/webhooks/endpoints/:id`

```json 200 OK theme={null}
{
  "success": true,
  "data": { "deleted": true }
}
```

## Reveal secret

`POST /api/v1/merchant/webhooks/endpoints/:id/reveal-secret`

Returns the signing secret once per call. Store it securely.

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/webhooks/endpoints/wh_ep_uuid/reveal-secret" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "secret": "whsec_live_abc123xyz"
  }
}
```

Verify inbound webhooks per the [Webhooks guide](https://docs.morapay.io/developer-tools/webhooks.md).

## Deliveries

`GET /api/v1/merchant/webhooks/deliveries?endpointId=&from=&to=`

`POST /api/v1/merchant/webhooks/deliveries/:id/retry`

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/webhooks/deliveries/delivery_uuid/retry" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

```json 202 Accepted theme={null}
{
  "success": true,
  "data": {
    "id": "delivery_uuid",
    "status": "QUEUED"
  }
}
```

```json 404 Not Found theme={null}
{
  "success": false,
  "error": "Webhook endpoint not found.",
  "code": "resource.not_found",
  "requestId": "req_wh404"
}
```

## Common event types

| Event | When |
| - | - |
| `payment_link.paid` | Payer completes checkout on a link |
| `ramp.created` | Merchant ramp transaction created ([Merchant ramp](https://docs.morapay.io/api-reference/merchant-ramp.md)) |
| `ramp.status_updated` | Merchant ramp status or settlement changed |
| `payout.status_updated` | Disbursement recipient status changes |
| `disbursement_batch.created` | Batch scheduled or created |
| `subscription.charge.succeeded` | Recurring charge succeeds |

Full list: [Webhooks guide](https://docs.morapay.io/developer-tools/webhooks.md).

## Related

* [Webhooks guide](https://docs.morapay.io/developer-tools/webhooks.md)
* [Conventions](https://docs.morapay.io/api-reference/conventions.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.