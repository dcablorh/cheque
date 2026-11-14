> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# api.internal_error

> Something went wrong on our end. Please try again shortly.

**Code:** `api.internal_error`\
**HTTP:** `500 Internal Server Error`

## What happened

The Morapay API could not complete the request due to rate limits, connectivity, or infrastructure.

## Safe message

> Something went wrong on our end. Please try again shortly.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

An unexpected error occurred while processing the request.

## How to fix it

Retry once. If it persists, contact Morapay support with the requestId.

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
  if (isMorapayError(err) && err.code === MorapayErrorCode.ApiInternalError) {
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