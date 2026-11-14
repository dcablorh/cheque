> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# auth.keys.secret_in_header

> We could not verify this request. Please try again later.

**Code:** `auth.keys.secret_in_header`\
**HTTP:** `401 Unauthorized`

## What happened

The API rejected the request during authentication before your route handler ran.

## Safe message

> We could not verify this request. Please try again later.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

A raw secret key (sk\_\*) was sent in a request header. Secret keys must never be transmitted in headers.

## How to fix it

Send pk\_\* in Morapay-Key and sign requests with sk\_\* server-side only via the SDK.

## UI hint

| Field | Value |
| - | - |
| `severity` | `critical` |
| `placement` | `toast` |

## Programmatic handling

```typescript theme={null}
import { MorapayAuthenticationError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.AuthKeysSecretInHeader) {
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