> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# links.amount.below_minimum

> This amount is below the minimum allowed for mobile money checkout in this region.

**Code:** `links.amount.below_minimum`\
**HTTP:** `422 Unprocessable Entity`

## What happened

The API rejected a payment link or checkout link create/update request.

## Safe message

> This amount is below the minimum allowed for mobile money checkout in this region.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Display message

> The transaction amount must be at least 1.00 GHS.

Use `err.displayMessage` in UI components. Reserve `err.message` for server logs.

## Why this happened

Mobile network operators enforce a platform floor transaction limit (for example, 1.00 GHS in Ghana).

## How to fix it

Validate cart totals and dynamic pricing so amount meets the regional minimum before calling morapay.link.create() or morapay.products.link().

## UI hint

| Field | Value |
| - | - |
| `severity` | `warning` |
| `placement` | `inline` |
| `actionText` | `Update amount` |

## Programmatic handling

```typescript theme={null}
import { MorapayInvalidRequestError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.LinksAmountBelowMinimum) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`links.slug.duplicate`](https://docs.morapay.io/errors/codes/links-slug-duplicate)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.