> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# api.rate_limited

> Too many requests. Please wait a moment and try again.

**Code:** `api.rate_limited`\
**HTTP:** `429 Too Many Requests`

## What happened

The Morapay API could not complete the request due to rate limits, connectivity, or infrastructure.

## Safe message

> Too many requests. Please wait a moment and try again.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

Your integration exceeded the Morapay API rate limit for this key or IP.

## How to fix it

Implement exponential backoff. Batch reads where possible and cache idempotent lookups.

## UI hint

| Field | Value |
| - | - |
| `severity` | `warning` |
| `placement` | `toast` |
| `actionText` | `Retry` |

## Programmatic handling

```typescript theme={null}
import { MorapayRateLimitError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.ApiRateLimited) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`api.service_unavailable`](https://docs.morapay.io/errors/codes/api-service-unavailable)
* [`api.proxy.core_unconfigured`](https://docs.morapay.io/errors/codes/api-proxy-core-unconfigured)
* [`api.proxy.signing_unconfigured`](https://docs.morapay.io/errors/codes/api-proxy-signing-unconfigured)
* [`api.proxy.core_unreachable`](https://docs.morapay.io/errors/codes/api-proxy-core-unreachable)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.