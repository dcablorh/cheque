> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Business QR and pay pages

> Open-amount business checkout, QR configuration, and payment requests.

Business QR lets customers pay any amount at a stable `/pay/:businessSlug` URL.

Base path: `/api/v1/merchant`

## Endpoints

| Method | Path | Description |
| - | - | - |
| `GET` | `/qr` | Get QR and pay page config |
| `POST` | `/qr` | Update QR branding and settings |
| `GET` | `/requests` | List payment requests |
| `POST` | `/requests` | Create payment request |
| `GET` | `/requests/:id` | Get payment request |

## Get QR config

`GET /api/v1/merchant/qr`

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/v1/merchant/qr" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "businessSlug": "acme-coffee",
    "enabled": true,
    "defaultCurrency": "GHS",
    "checkoutUrl": "https://checkout.morapay.io/pay/acme-coffee"
  }
}
```

```json 401 Unauthorized theme={null}
{
  "success": false,
  "error": "Invalid request signature.",
  "code": "auth.signature.mismatch",
  "requestId": "req_qr401"
}
```

## Update QR config

`POST /api/v1/merchant/qr`

Update slug visibility, default currency, and display options per your dashboard schema.

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/qr" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{ "enabled": true, "defaultCurrency": "GHS" }'
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "enabled": true,
    "defaultCurrency": "GHS"
  }
}
```

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "Invalid body.",
  "code": "request.invalid",
  "requestId": "req_qr400"
}
```

## Payment requests

REQUEST-type flows for ad hoc invoices: create a payable link, notify the payer, and track status.

| Method | Path | Description |
| - | - | - |
| `GET` | `/requests` | List requests |
| `POST` | `/requests` | Create request |
| `GET` | `/requests/:id` | Request detail |

> [!NOTE]
>
> Legacy path `/payment-requests` is retired. Use `/requests`.

### Create request

`POST /api/v1/merchant/requests`

```bash cURL theme={null}
curl -s -X POST "https://api.morapay.io/api/v1/merchant/requests" \
  -H "Content-Type: application/json" \
  -H "Morapay-Key: $MORAPAY_PUBLIC_KEY" \
  -H "Morapay-Timestamp: $TIMESTAMP" \
  -H "Morapay-Signature: v1=$SIGNATURE" \
  -d '{
    "amount": 50,
    "currency": "GHS",
    "description": "Table 4",
    "notifyEmail": "customer@example.com"
  }'
```

```json 201 Created theme={null}
{
  "success": true,
  "data": {
    "id": "req_uuid",
    "code": "ABC123",
    "linkId": "link_uuid",
    "transactionId": "txn_uuid",
    "payLink": "https://checkout.morapay.io/pay/ABC123",
    "status": "PENDING"
  }
}
```

```json 404 Not Found theme={null}
{
  "success": false,
  "error": "Payment link not found.",
  "code": "resource.not_found",
  "requestId": "req_pr404"
}
```

### List and get

`GET /api/v1/merchant/requests?page=1&limit=20&status=PENDING`

`GET /api/v1/merchant/requests/:id`

Payer-facing lookup and crypto pay helpers live on the public API. See [Public checkout](https://docs.morapay.io/api-reference/public-checkout.md#payment-requests).

## Common errors

| Code | HTTP | Cause |
| - | - | - |
| `resource.not_found` | 404 | Unknown request id |
| `links.slug.duplicate` | 409 | Business slug conflict |
| `request.invalid` | 400 | Invalid body |
| `auth.signature.mismatch` | 401 | Invalid signed request |

## Related

* [Public checkout](https://docs.morapay.io/api-reference/public-checkout.md)
* [Payment links API](https://docs.morapay.io/api-reference/payment-links.md)
* [Products API](https://docs.morapay.io/api-reference/products.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.