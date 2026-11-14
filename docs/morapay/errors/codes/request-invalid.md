> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# request.invalid

> Some of the information provided is invalid. Please review and try again.

**Code:** `request.invalid`\
**HTTP:** `400 Bad Request`

## What happened

The API understood the request but rejected the payload or business rules.

## Safe message

> Some of the information provided is invalid. Please review and try again.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The API rejected the request payload.

## How to fix it

Inspect details for field-level validation errors and correct the request body.

## UI hint

| Field | Value |
| - | - |
| `severity` | `warning` |
| `placement` | `inline` |

## Programmatic handling

```typescript theme={null}
import { MorapayInvalidRequestError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.RequestInvalid) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`request.validation_failed`](https://docs.morapay.io/errors/codes/request-validation-failed)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.