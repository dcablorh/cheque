> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Payout timing & limits

> Processing windows, platform minimums, and delivery estimates.

Constraints for disbursements, withdrawals, and checkout minimums. Values come from platform settings and payout worker scheduling.

## Platform minimums

| Product | Minimum | Setting key |
| - | - | - |
| Payment links | \$1 | minPaymentLinkUsd |
| Subscriptions | \$1 | minSubscriptionUsd |
| Disbursement / recurring batches | \$5 | minRecurringUsd |
| Withdrawals | \$5 | minWithdrawalUsd |
| Payouts | \$5 | minPayoutUsd |
| Platform transfers | \$0.5 | minPlatformTransferUsd |

Regional MoMo floors may exceed USD equivalents, for example **1.00 GHS** in Ghana. Below-minimum amounts return `links.amount.below_minimum`.

## Disbursement batch scheduling

| Phase | Behavior |
| - | - |
| **Batch creation** | You set `processingAt` ISO datetime. Batch stays `SCHEDULED` until that time. |
| **Dispatch** | Worker picks up batches when `processingAt <= now`. Status moves to `PROCESSING`. |
| **On-chain settlement** | Stablecoin is sent from treasury pool to settlement infrastructure. |
| **MoMo / bank delivery** | Local payout rails execute per recipient after on-chain leg completes. |

### Estimated recipient delivery after dispatch starts

On-chain chunk execution is estimated at **\~2 minutes per multicall chunk**, capped between **2** and **120** minutes:

```
estimatedMinutes = max(2, min(120, chunkCount × 2))
```

Merchants receive email copy like: *recipients should receive funds within \~N minutes after dispatch begins*.

> [!WARNING]
>
> Carrier downtime, invalid recipient details, or insufficient treasury balance can delay or fail individual recipients. Listen for `payout.status_updated` webhooks and retry with a new idempotency key when appropriate.

## Rail-specific timing typical

| Rail | Typical settlement |
| - | - |
| **Ghana MoMo** | Minutes after batch dispatch completes on-chain |
| **Ghana bank** | Same business day to 1 business day |
| **Nigeria bank** | Same business day to 2 business days |
| **Card checkout** | Instant authorization; settlement per processor schedule |
| **Crypto checkout** | Block confirmation time for the payer chain |

Exact timing depends on the payer bank, mobile money operator, and chain congestion. Include `requestId` when contacting support.

## Idempotency

Deposits and withdrawals on the disbursement account require an `idempotencyKey` 8–200 chars. See [Idempotency](https://docs.morapay.io/developer-tools/idempotency.md).

## Related

* [Disbursement tokens](https://docs.morapay.io/reference/disbursement-tokens.md)
* [Banks & MoMo withdrawal](https://docs.morapay.io/reference/banks-and-momo.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.