> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# crypto.chain.unsupported

> This payment network is not supported for checkout.

**Code:** `crypto.chain.unsupported`\
**HTTP:** `422 Unprocessable Entity`

## What happened

The API rejected a crypto quote or checkout request for the selected network or slippage settings.

## Safe message

> This payment network is not supported for checkout.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

The chain ID or network layer is not enabled for your merchant account.

## How to fix it

Use a supported network from your dashboard settings or contact Morapay to enable the chain.

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
  if (isMorapayError(err) && err.code === MorapayErrorCode.CryptoChainUnsupported) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`crypto.slippage.exceeded`](https://docs.morapay.io/errors/codes/crypto-slippage-exceeded)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.