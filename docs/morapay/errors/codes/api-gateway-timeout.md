> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# api.gateway_timeout

> Our payment service is temporarily unavailable. Please try again shortly.

**Code:** `api.gateway_timeout`\
**HTTP:** `504 Gateway Timeout`

## What happened

The Morapay API could not complete the request due to rate limits, connectivity, or infrastructure.

## Safe message

> Our payment service is temporarily unavailable. Please try again shortly.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The Morapay API timed out waiting for an upstream service.

## How to fix it

Retry with backoff. Reduce payload size or split batch operations if applicable.

## UI hint

| Field | Value |
| - | - |
| `severity` | `critical` |
| `placement` | `toast` |
| `actionText` | `Retry` |

## Programmatic handling

```typescript theme={null}
import { MorapayApiError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.ApiGatewayTimeout) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`api.rate_limited`](https://docs.morapay.io/errors/codes/api-rate-limited)
* [`api.service_unavailable`](https://docs.morapay.io/errors/codes/api-service-unavailable)
* [`api.proxy.core_unconfigured`](https://docs.morapay.io/errors/codes/api-proxy-core-unconfigured)
* [`api.proxy.signing_unconfigured`](https://docs.morapay.io/errors/codes/api-proxy-signing-unconfigured)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.