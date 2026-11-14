> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# resource.conflict

> This action conflicts with an existing record. Please refresh and try again.

**Code:** `resource.conflict`\
**HTTP:** `409 Conflict`

## What happened

The API could not find or reconcile the resource referenced in your request.

## Safe message

> This action conflicts with an existing record. Please refresh and try again.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The resource already exists or changed since you last read it.

## How to fix it

Fetch the latest state and retry with an updated payload or a new idempotency key.

## UI hint

| Field | Value |
| - | - |
| `severity` | `info` |
| `placement` | `inline` |

## Programmatic handling

```typescript theme={null}
import { MorapayConflictError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.ResourceConflict) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`resource.not_found`](https://docs.morapay.io/errors/codes/resource-not-found)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.