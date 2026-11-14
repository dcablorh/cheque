> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# crypto.slippage.exceeded

> The exchange rate moved too much. Please refresh and try again.

**Code:** `crypto.slippage.exceeded`\
**HTTP:** `422 Unprocessable Entity`

## What happened

The API rejected a crypto quote or checkout request for the selected network or slippage settings.

## Safe message

> The exchange rate moved too much. Please refresh and try again.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The FX swap rate moved past your configured maximum slippage tolerance.

## How to fix it

Refresh the quote and retry, or widen slippage tolerance if your product allows it.

## UI hint

| Field | Value |
| - | - |
| `severity` | `warning` |
| `placement` | `inline` |
| `actionText` | `Refresh quote` |

## Programmatic handling

```typescript theme={null}
import { MorapayInvalidRequestError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.CryptoSlippageExceeded) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`crypto.chain.unsupported`](https://docs.morapay.io/errors/codes/crypto-chain-unsupported)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.