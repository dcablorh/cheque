> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# payouts.network.carrier_down

> Mobile money is temporarily unavailable. Please try again in a few minutes.

**Code:** `payouts.network.carrier_down`\
**HTTP:** `503 Service Unavailable`

## What happened

The API could not complete a payout, disbursement, or treasury operation.

## Safe message

> Mobile money is temporarily unavailable. Please try again in a few minutes.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

A regional mobile money operator node (MTN, Telecel, etc.) is reporting downtime.

## How to fix it

Queue the payout for retry and alert operations. Include requestId when contacting Morapay support.

## UI hint

| Field | Value |
| - | - |
| `severity` | `critical` |
| `placement` | `modal` |
| `actionText` | `View account` |

## Programmatic handling

```typescript theme={null}
import { MorapayApiError, isMorapayError, MorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err) && err.code === MorapayErrorCode.PayoutsNetworkCarrierDown) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`payouts.momo.insufficient_balance`](https://docs.morapay.io/errors/codes/payouts-momo-insufficient-balance)
* [`payouts.clearing.refund_failed`](https://docs.morapay.io/errors/codes/payouts-clearing-refund-failed)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.