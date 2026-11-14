> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# kyb.forbidden

> You do not have permission to perform this action.

**Code:** `kyb.forbidden`\
**HTTP:** `403 Forbidden`

## What happened

The API blocked the action because of your business KYB state or permissions.

## Safe message

> You do not have permission to perform this action.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

Your account does not have KYB permissions for this operation.

## How to fix it

Complete KYB verification in the dashboard or contact your business admin.

## UI hint

| Field | Value |
| - | - |
| `severity` | `critical` |
| `placement` | `modal` |

## Programmatic handling

```typescript theme={null}
import { MorapayPermissionError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.KybForbidden) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`kyb.blocked`](https://docs.morapay.io/errors/codes/kyb-blocked)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.