> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# auth.signature.invalid_timestamp

> We could not verify this request. Please try again later.

**Code:** `auth.signature.invalid_timestamp`\
**HTTP:** `401 Unauthorized`

## What happened

The API rejected the request during authentication before your route handler ran.

## Safe message

> We could not verify this request. Please try again later.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

Morapay-Timestamp is not a valid Unix seconds value.

## How to fix it

Set Morapay-Timestamp to Math.floor(Date.now() / 1000) at request time.

## UI hint

| Field | Value |
| - | - |
| `severity` | `critical` |
| `placement` | `toast` |

## Programmatic handling

```typescript theme={null}
import { MorapayAuthenticationError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.AuthSignatureInvalidTimestamp) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`auth.unauthorized`](https://docs.morapay.io/errors/codes/auth-unauthorized)
* [`auth.credentials_missing`](https://docs.morapay.io/errors/codes/auth-credentials-missing)
* [`auth.session_invalid`](https://docs.morapay.io/errors/codes/auth-session-invalid)
* [`auth.business_context_required`](https://docs.morapay.io/errors/codes/auth-business-context-required)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.