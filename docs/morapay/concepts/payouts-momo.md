> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Payouts & mobile money

> Disburse funds to MoMo wallets via batch payouts and treasury accounts.

Morapay **disbursements** route merchant treasury liquidity to local mobile money wallets: MTN, Telecel, and other regional carriers. The Merchant API exposes this under `/api/v1/merchant/disbursement/*`; the SDK namespace is `morapay.disbursement`.

## Business value

Turn stablecoin or fiat treasury balance into **instant local payouts** without building carrier integrations yourself. Quote fees upfront, schedule one-time or recurring batches, and track ledger entries per business.

## Flow

```mermaid theme={null}
flowchart LR
  A["morapay.disbursement.account()"]
  Q["morapay.disbursement.quote()"]
  B["Create batch\n(recipients, chain, token)"]
  L["morapay.disbursement.ledger()"]
  M["MoMo delivery"]

  A --> Q --> B --> M
  B --> L
```

## SDK reference

```typescript theme={null}
const account = await morapay.disbursement.account();

const quote = await morapay.disbursement.quote({
  chainId: 8453,
  token: "USDC",
  payoutTotal: 250,
  recipientCount: 10,
});

const { data: batches } = await morapay.disbursement({ limit: 20 });
const batch = await morapay.disbursement("batch_xyz");

const { data: ledger } = await morapay.disbursement.ledger({ page: 1, limit: 50 });

await morapay.disbursement.cancel("batch_xyz");
```

### Batch creation

Batches are created via `POST /disbursement/batches` with:

* `chainId`, `token`: settlement rail (validated per environment)
* `schedule`: `one_time` or `recurring`
* `recipients[]`: name, contact, payer account, amounts
* `usdCharge`, `payoutTotal`, `processingAt`: must match a prior quote

Deposits and withdrawals on the disbursement account accept an **`idempotencyKey`** (8–200 chars) to prevent duplicate ledger movements.

## Minimums & balances

| Check | Detail |
| - | - |
| Platform minimum | Default **\$5 USD** for recurring/disbursement (`minRecurringUsd`) |
| Insufficient liquidity | `payouts.momo.insufficient_balance` |
| Carrier downtime | `payouts.network.carrier_down`; queue and retry |

Always call `morapay.disbursement.account()` before large batches.

## Webhook

`disbursement_batch.created` fires when a batch is accepted. Payout status changes may also arrive via `payout.status_updated`.

## FAQ

> [accordion] What are the minimum MoMo settlement amounts?
>
> Platform USD minimums apply at quote time. Individual corridors such as Ghana GHS may enforce additional carrier floors; validate amounts client-side before submitting batches.

> [accordion] How do I handle network downtime?
>
> Catch `payouts.network.carrier_down`, enqueue the batch for retry with backoff, and alert operations. Include `requestId` when contacting support.

## Next steps

> [card] [Disbursement tokens](https://docs.morapay.io/reference/disbursement-tokens.md)
>
> USDC on Base and Ethereum (LIVE) · Base Sepolia (TEST).

> [card] [Payout timing](https://docs.morapay.io/reference/payout-timing.md)
>
> Minimums, batch scheduling, and MoMo vs bank SLAs.

> [card] [Banks & MoMo](https://docs.morapay.io/reference/banks-and-momo.md)
>
> Withdrawal rails and operator catalogs.

> [card] [Webhooks](https://docs.morapay.io/developer-tools/webhooks.md)
>
> `disbursement_batch.created` and `payout.status_updated`.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.