> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# payouts.clearing.refund_failed

> This payout could not be completed. Please contact support.

**Code:** `payouts.clearing.refund_failed`\
**HTTP:** `500 Internal Server Error`

## What happened

The API could not complete a payout, disbursement, or treasury operation.

## Safe message

> This payout could not be completed. Please contact support.

Use `err.safeMessage` or `err.displayMessage` in customer UI, not `err.message`.

## Why this happened

Clearing funds back to inventory failed during payout lifecycle processing.

## How to fix it

Contact Morapay support with the requestId. Do not retry the same batch until the settlement state is confirmed.

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
  if (isMorapayError(err) && err.code === MorapayErrorCode.PayoutsClearingRefundFailed) {
    console.error(err.format());
    // Customer UI: err.displayMessage ?? err.safeMessage
    // Support: err.requestId
  }
}
```

## Related codes

* [`payouts.momo.insufficient_balance`](https://docs.morapay.io/errors/codes/payouts-momo-insufficient-balance)
* [`payouts.network.carrier_down`](https://docs.morapay.io/errors/codes/payouts-network-carrier-down)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.