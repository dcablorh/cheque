> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# links.slug.duplicate

> This checkout link address is already in use. Please choose another.

**Code:** `links.slug.duplicate`\
**HTTP:** `409 Conflict`

## What happened

The API rejected a payment link or checkout link create/update request.

## Safe message

> This checkout link address is already in use. Please choose another.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The custom vanity slug you requested is already active on another payment link.

## How to fix it

Pick a different slug or omit it to let Morapay allocate one automatically.

## UI hint

| Field | Value |
| - | - |
| `severity` | `warning` |
| `placement` | `inline` |

## Programmatic handling

```typescript theme={null}
import { MorapayConflictError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.LinksSlugDuplicate) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`links.amount.below_minimum`](https://docs.morapay.io/errors/codes/links-amount-below-minimum)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.