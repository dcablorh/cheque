> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# resource.not_found

> The requested item could not be found.

**Code:** `resource.not_found`\
**HTTP:** `404 Not Found`

## What happened

The API could not find or reconcile the resource referenced in your request.

## Safe message

> The requested item could not be found.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The ID in the request path does not exist or is not visible to your merchant account.

## How to fix it

Verify the resource ID, environment (TEST vs LIVE), and that the record was not deleted.

## UI hint

| Field | Value |
| - | - |
| `severity` | `info` |
| `placement` | `inline` |

## Programmatic handling

```typescript theme={null}
import { MorapayNotFoundError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.ResourceNotFound) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`resource.conflict`](https://docs.morapay.io/errors/codes/resource-conflict)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.