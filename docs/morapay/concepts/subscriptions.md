> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Subscriptions

> Plans, enrolled subscribers, and recurring payment events.

Subscriptions let merchants sell recurring access: SaaS seats, memberships, or installment plans through the Merchant API (`/api/v1/merchant/subscriptions`).

## Overview

| Concept | SDK access | API path |
| - | - | - |
| Plans | `morapay.subscriptions.plans()` | `GET/POST /subscriptions/plans` |
| Enrollments | `morapay.subscriptions()` | `GET/POST /subscriptions` |
| Lifecycle | `.pause(id)` / `.cancel(id)` | `POST /subscriptions/:id/pause` etc. |

Plans define price and interval. Subscriptions represent a customer enrolled in a plan.

## Create a plan and enroll

```typescript theme={null}
const plan = await morapay.subscriptions.plans.create({
  name: "Pro monthly",
  amount: 29,
  currency: "USD",
  interval: "MONTH",
});

const subscription = await morapay.subscriptions.create({
  planId: plan.id,
  customerEmail: "alex@example.com",
});

const active = await morapay.subscriptions(subscription.id);
await morapay.subscriptions.pause(subscription.id);
```

List and get use the callable pattern:

```typescript theme={null}
const { data: plans } = await morapay.subscriptions.plans({ limit: 10 });
const { data: subs } = await morapay.subscriptions({ status: "ACTIVE" });
```

## Architecture

```mermaid theme={null}
flowchart TB
  Plan["Subscription plan\n(amount, interval)"]
  Sub["Enrollment\n(customer, status)"]
  Pay["Payment events"]
  WH["Webhook:\nsubscription.payment_received"]

  Plan --> Sub
  Sub --> Pay
  Pay --> WH
```

Morapay handles billing orchestration, ledger entries, and notifications. Public checkout flows for subscriptions are served separately on the checkout host (payer-facing, no merchant keys).

## Webhook events

| Event | When |
| - | - |
| `subscription.payment_received` | A subscription payment settles |

Full event list: [Webhooks](https://docs.morapay.io/developer-tools/webhooks.md).

## Platform minimums

Subscription charges enforce `minSubscriptionUsd` (default **\$1 USD** equivalent).

## FAQ

> [accordion] Can I import existing subscribers?
>
> Bulk import endpoints under `/subscriptions/imports` support dashboard-driven migrations. Contact support for large CSV imports.

> [accordion] What statuses can a subscription have?
>
> Use the `status` filter on `morapay.subscriptions()`; values include `ACTIVE`, `PAUSED`, and terminal states returned by the API.

> [accordion] Do subscriptions use idempotency keys?
>
> Merchant-initiated deposits to the subscription account accept an `idempotencyKey` in the request body. See [Idempotency](https://docs.morapay.io/developer-tools/idempotency.md).

## Next step

[Payouts & MoMo](https://docs.morapay.io/concepts/payouts-momo.md): disburse stablecoin liquidity to mobile money wallets.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.