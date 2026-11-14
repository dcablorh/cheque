> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# request.validation_failed

> Some of the information provided is invalid. Please review and try again.

**Code:** `request.validation_failed`\
**HTTP:** `422 Unprocessable Entity`

## What happened

The API understood the request but rejected the payload or business rules.

## Safe message

> Some of the information provided is invalid. Please review and try again.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The request was understood but failed business or schema validation.

## How to fix it

Read details for per-field issues. Cross-check required fields in the API reference.

## UI hint

| Field | Value |
| - | - |
| `severity` | `warning` |
| `placement` | `inline` |

## Programmatic handling

```typescript theme={null}
import { MorapayInvalidRequestError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.RequestValidationFailed) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`request.invalid`](https://docs.morapay.io/errors/codes/request-invalid)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.