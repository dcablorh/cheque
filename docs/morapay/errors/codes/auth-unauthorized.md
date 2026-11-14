> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# auth.unauthorized

> We could not verify this request. Please try again later.

**Code:** `auth.unauthorized`\
**HTTP:** `401 Unauthorized`

## What happened

The API rejected the request during authentication before your route handler ran.

## Safe message

> We could not verify this request. Please try again later.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The request did not include valid signed API credentials (Morapay-Key, Morapay-Timestamp, Morapay-Signature).

## How to fix it

Initialize Morapay with your pk\_\* and sk\_\* pair on the server. Never expose sk\_\* in browser code.

## UI hint

| Field | Value |
| - | - |
| `severity` | `critical` |
| `placement` | `toast` |

## Programmatic handling

```typescript theme={null}
import { MorapayAuthenticationError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.AuthUnauthorized) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`auth.credentials_missing`](https://docs.morapay.io/errors/codes/auth-credentials-missing)
* [`auth.session_invalid`](https://docs.morapay.io/errors/codes/auth-session-invalid)
* [`auth.business_context_required`](https://docs.morapay.io/errors/codes/auth-business-context-required)
* [`auth.business_access_denied`](https://docs.morapay.io/errors/codes/auth-business-access-denied)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.