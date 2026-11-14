> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# api.service_unavailable

> Our payment service is temporarily unavailable. Please try again shortly.

**Code:** `api.service_unavailable`\
**HTTP:** `503 Service Unavailable`

## What happened

The Morapay API could not complete the request due to rate limits, connectivity, or infrastructure.

## Safe message

> Our payment service is temporarily unavailable. Please try again shortly.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The Morapay API could not complete the request due to a transient infrastructure issue.

## How to fix it

Retry with backoff. If the issue persists, contact support with the requestId.

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
  if (isMorapayError(err) && err.code === MorapayErrorCode.ApiServiceUnavailable) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`api.rate_limited`](https://docs.morapay.io/errors/codes/api-rate-limited)
* [`api.proxy.core_unconfigured`](https://docs.morapay.io/errors/codes/api-proxy-core-unconfigured)
* [`api.proxy.signing_unconfigured`](https://docs.morapay.io/errors/codes/api-proxy-signing-unconfigured)
* [`api.proxy.core_unreachable`](https://docs.morapay.io/errors/codes/api-proxy-core-unreachable)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.