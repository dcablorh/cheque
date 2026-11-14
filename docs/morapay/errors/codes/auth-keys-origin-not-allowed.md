> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# auth.keys.origin_not_allowed

> This action is not available from this application.

**Code:** `auth.keys.origin_not_allowed`\
**HTTP:** `403 Forbidden`

## What happened

The API rejected the request during authentication before your route handler ran.

## Safe message

> This action is not available from this application.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The API key is restricted to specific allowed origins and the request origin is not on the allowlist.

## How to fix it

Add the server origin to the key's allowed domains in the dashboard, or call the API from an approved backend.

## UI hint

| Field | Value |
| - | - |
| `severity` | `critical` |
| `placement` | `toast` |

## Programmatic handling

```typescript theme={null}
import { MorapayAuthenticationError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.AuthKeysOriginNotAllowed) {
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