> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Idempotency

> Prevent duplicate ledger movements and safely retry API calls.

Idempotency ensures that **retrying the same logical operation** does not double-charge, double-credit, or create duplicate ledger entries.

## Where Morapay uses idempotency

### Disbursement account transfers

`POST /api/v1/merchant/disbursement/deposit` and `/withdraw` require an `idempotencyKey` (8–200 characters):

```typescript theme={null}
// The API validates idempotencyKey on deposit/withdraw bodies
await fetch("https://api.morapay.io/api/v1/merchant/disbursement/deposit", {
  method: "POST",
  body: JSON.stringify({
    amountUsd: 100,
    idempotencyKey: "deposit-2026-03-15-ops-topup",
  }),
});
```

Replaying the same key returns the original result instead of creating a second movement.

### Automated settlement flows

Subscription charges and other platform-initiated settlements use Morapay-managed idempotency. You do not supply keys for those events; design your webhook handlers to be idempotent instead.

### Conflict retries

When a resource changed since your last read, the API may return `resource.conflict` (HTTP 409). The error guide recommends fetching fresh state and retrying with an **updated payload or new idempotency key**.

## Guidelines for merchants

**1. Generate deterministic keys**

Use a stable identifier for the business action: `payout-batch-{batchId}`, `deposit-{treasuryTransferId}`.

**2. Reuse keys only for true retries**

Same key + same body = safe retry after network timeout. A **different** amount needs a **new** key.

**3. Store keys with your domain records**

Persist the idempotency key alongside the disbursement batch or treasury transfer row in your database.

## SDK note

The high-level `morapay.disbursement` resource exposes batch quote, list, and cancel helpers. Deposit/withdraw with explicit idempotency keys map to `/api/v1/merchant/disbursement/deposit` and `/disbursement/withdraw`; use your server's HTTP client or extend your integration layer when calling these directly.

## Webhooks + idempotency

Webhook handlers should be idempotent by `event.id` or a composite of `(event.type, resourceId, status)`. See [Webhooks](https://docs.morapay.io/developer-tools/webhooks.md).

## Next step

[Error handling](https://docs.morapay.io/errors/error-handling.md): structured errors with `requestId` for support correlation.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.