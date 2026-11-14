> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Quickstart

> Make your first Morapay API call in under three minutes.

Get a **200 OK** from the Merchant API v1 using the official TypeScript SDK.

## Prerequisites

* Node.js **18+**
* A Morapay merchant account with **TEST** API keys (`pk_test_*` / `sk_test_*`)
* Keys created under **Dashboard → Developers → API keys**

> [!WARNING]
>
> The SDK is **server-side only**. Never embed `sk_*` in browsers, mobile apps, or checkout bundles.

**1. Install the SDK**

> [tab] npm
>
> ```bash theme={null}
> npm install @morapay/sdk
> ```

> [tab] yarn
>
> ```bash theme={null}
> yarn add @morapay/sdk
> ```

> [tab] pnpm
>
> ```bash theme={null}
> pnpm add @morapay/sdk
> ```

**2. Initialize Morapay**

Only **API keys** are required. `baseUrl` and `checkoutBaseUrl` default to production hosts.

```typescript theme={null}
import { Morapay } from "@morapay/sdk";

const morapay = new Morapay({
  publicKey: process.env.MORAPAY_PUBLIC_KEY!,
  secretKey: process.env.MORAPAY_SECRET_KEY!,
});
```

**3. Create a payment link**

The SDK uses a **callable resource** pattern: list with `()`, get with `(id)`.

```typescript theme={null}
const link = await morapay.link.create({
  title: "Invoice #42",
  amount: 100,
  currency: "USD",
});

console.log(morapay.buildCheckoutUrl(link.publicCode));
```

**4. Expected responses**

> [tab] API
>
> Every response is JSON with a `success` flag. Signed requests include `Morapay-Key`, `Morapay-Timestamp`, and `Morapay-Signature` headers.
>
> **Success** for `POST /api/v1/merchant/links`:
>
> ```json 200 OK theme={null}
> {
>   "success": true,
>   "data": {
>     "id": "link_abc123",
>     "title": "Invoice #42",
>     "amount": 100,
>     "currency": "USD",
>     "publicCode": "abc123xyz",
>     "status": "ACTIVE",
>     "paidAt": null
>   }
> }
> ```
>
> ```json 422 Unprocessable Entity theme={null}
> {
>   "success": false,
>   "error": "Invalid payload. amount failed platform minimum check.",
>   "code": "links.amount.below_minimum",
>   "safeMessage": "This amount is below the minimum allowed for mobile money checkout in this region.",
>   "displayMessage": "The transaction amount must be at least 1.00 GHS.",
>   "why": "Mobile network operators enforce a platform floor transaction limit.",
>   "howToFix": "Validate cart totals before calling morapay.link.create() or morapay.products.link().",
>   "docUrl": "https://docs.morapay.io/errors/codes/links-amount-below-minimum",
>   "uiHint": {
>     "severity": "warning",
>     "placement": "inline",
>     "actionText": "Update amount"
>   },
>   "requestId": "req_1717483920_abc",
>   "details": {}
> }
> ```

> [tab] SDK
>
> The SDK unwraps `data` on success and throws a typed `MorapayError` subclass on failure.
>
> **Success**. `morapay.link.create()` resolves to the link object:
>
> ```json Success theme={null}
> {
>   "id": "link_abc123",
>   "title": "Invoice #42",
>   "amount": 100,
>   "currency": "USD",
>   "publicCode": "abc123xyz",
>   "status": "ACTIVE",
>   "paidAt": null
> }
> ```
>
> **Failure:** the same `422` body becomes a thrown error:
>
> ```typescript theme={null}
> import {
>   MorapayInvalidRequestError,
>   MorapayErrorCode,
>   isMorapayError,
> } from "@morapay/sdk";
>
> try {
>   await morapay.link.create({ title: "Order", amount: 0.5, currency: "GHS" });
> } catch (err) {
>   if (
>     err instanceof MorapayInvalidRequestError &&
>     err.code === MorapayErrorCode.LinksAmountBelowMinimum
>   ) {
>     err.displayMessage;  // safe for customer UI
>     err.requestId;       // pass to support
>     console.error(err.format());
>   }
> }
> ```
>
> ```text Failure (err.format()) theme={null}
> 🛑 [MorapayInvalidRequestError] -> Invalid payload. amount failed platform minimum check.
>
> [Code]        links.amount.below_minimum
> [Request ID]  req_1717483920_abc
> [Status]      422 Unprocessable Entity
>
> [Why this happened]
> Mobile network operators enforce a platform floor transaction limit.
>
> [How to fix it]
> Validate cart totals before calling morapay.link.create() or morapay.products.link().
>
> [Display message]
> The transaction amount must be at least 1.00 GHS.
> ```

See [Authentication](https://docs.morapay.io/getting-started/authentication.md) for signing details and [Error handling](https://docs.morapay.io/errors/error-handling.md) for the full error envelope.

## Next steps

> [card] [Native UI components](https://docs.morapay.io/frontend-ui/native-components.md)
>
> Render errors and checkout UI without boilerplate.

> [card] [Webhooks](https://docs.morapay.io/developer-tools/webhooks.md)
>
> Receive real-time payment and payout events.

> [card] [Payment links](https://docs.morapay.io/concepts/payment-links.md)
>
> Deep dive into links, products, and checkout sessions.

> [card] [Error handling](https://docs.morapay.io/errors/error-handling.md)
>
> Consultant-grade errors with `requestId` and UI hints.

> [card] [API reference](https://docs.morapay.io/api-reference/overview.md)
>
> REST endpoints for catalog, disbursement, and payout rails.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.