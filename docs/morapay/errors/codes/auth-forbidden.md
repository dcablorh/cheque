> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# auth.forbidden

> You do not have permission to perform this action.

**Code:** `auth.forbidden`\
**HTTP:** `403 Forbidden`

## What happened

The API rejected the request during authentication before your route handler ran.

## Safe message

> You do not have permission to perform this action.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

Your API key is valid but lacks permission for this resource or operation.

## How to fix it

Confirm key scopes in the dashboard and that you are using the correct business account.

## UI hint

| Field | Value |
| - | - |
| `severity` | `critical` |
| `placement` | `toast` |

## Programmatic handling

```typescript theme={null}
import { MorapayAuthenticationError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.AuthForbidden) {
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