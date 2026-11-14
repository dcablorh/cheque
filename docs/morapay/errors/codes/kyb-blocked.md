> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# kyb.blocked

> This action is not available for your account.

**Code:** `kyb.blocked`\
**HTTP:** `403 Forbidden`

## What happened

The API blocked the action because of your business KYB state or permissions.

## Safe message

> This action is not available for your account.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

KYB verification is blocked or under review for this business.

## How to fix it

Check KYB status in the dashboard or contact Morapay support.

## UI hint

| Field | Value |
| - | - |
| `severity` | `critical` |
| `placement` | `modal` |

## Programmatic handling

```typescript theme={null}
import { MorapayPermissionError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.KybBlocked) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`kyb.forbidden`](https://docs.morapay.io/errors/codes/kyb-forbidden)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.