> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Error handling

> Consultant-grade errors with safeMessage, displayMessage, uiHint, and requestId.

Morapay errors are designed as an **on-demand consultant**, not just a stack trace. Every failed Merchant API response includes enough context for developers, support engineers, and customer-facing UI.

## Error envelope

```json theme={null}
{
  "success": false,
  "error": "Invalid payload. amount failed platform minimum check.",
  "code": "links.amount.below_minimum",
  "safeMessage": "This amount is below the minimum allowed for mobile money checkout in this region.",
  "displayMessage": "The transaction amount must be at least 1.00 GHS.",
  "why": "Mobile network operators enforce a platform floor transaction limit.",
  "howToFix": "Validate cart totals before calling the payment links API.",
  "docUrl": "https://docs.morapay.io/errors/codes/links-amount-below-minimum",
  "uiHint": {
    "severity": "warning",
    "placement": "inline",
    "actionText": "Update amount"
  },
  "requestId": "req_1717483920_abc",
  "details": {}
}
```

## Field guide

| Field | Audience | Use |
| - | - | - |
| `error` / `err.message` | Developers | Server logs, Sentry; may include field paths |
| `safeMessage` / `err.safeMessage` | Customer UI | Sanitized copy for any surface |
| `displayMessage` / `err.displayMessage` | UI components | Intent-driven display text |
| `uiHint` / `err.uiHint` | UI components | `{ severity, placement, actionText? }` |
| `code` / `err.code` | Programmatic | Semantic namespace `domain.resource.reason` |
| `requestId` / `err.requestId` | Support | Correlate with API logs (`Morapay-Request-Id` header) |
| `docUrl` / `err.docUrl` | Self-serve | Deep link to error code documentation |
| `details` / `err.details` | Validation | Field-level breakdown |

## SDK usage

```typescript theme={null}
import {
  Morapay,
  MorapayInvalidRequestError,
  MorapayAuthenticationError,
  MorapayErrorCode,
  MorapayUi,
  isMorapayError,
} from "@morapay/sdk";

try {
  await morapay.products.link("prod_123", { amount: 0.1, currency: "GHS" });
} catch (err) {
  if (err instanceof MorapayInvalidRequestError) {
    showInlineError(err.displayMessage);
    console.error(err.format());
  } else if (err instanceof MorapayAuthenticationError) {
    alertOps(err.requestId);
  } else if (isMorapayError(err) && err.code === MorapayErrorCode.PayoutsMomoInsufficientBalance) {
    MorapayUi.toast(err);
  }
}
```

### Error code dictionary

Import `MorapayErrorCode` for IDE autocomplete instead of string literals. Typos fail at compile time when you compare against the dictionary:

```typescript theme={null}
import { MorapayErrorCode, isMorapayError, isMorapayErrorCode } from "@morapay/sdk";

catch (err) {
  if (isMorapayError(err)) {
    switch (err.code) {
      case MorapayErrorCode.LinksAmountBelowMinimum:
        showInlineError(err.displayMessage);
        break;
      case MorapayErrorCode.AuthKeysExpired:
        redirectToKeyRotation();
        break;
      default:
        if (isMorapayErrorCode(err.code)) {
          console.error(err.format());
        }
    }
  }
}
```

### Error subclasses

| Class | Typical HTTP |
| - | - |
| `MorapayAuthenticationError` | 401 |
| `MorapayPermissionError` | 403 |
| `MorapayNotFoundError` | 404 |
| `MorapayConflictError` | 409 |
| `MorapayInvalidRequestError` | 400, 422 |
| `MorapayRateLimitError` | 429 |
| `MorapayApiError` | 5xx |
| `MorapayConnectionError` | Network / non-JSON |

## Semantic codes

Codes follow `domain.resource.reason`:

```
auth.signature.mismatch
links.amount.below_minimum
payouts.momo.insufficient_balance
```

### Authentication

| Code | HTTP |
| - | - |
| [`auth.unauthorized`](https://docs.morapay.io/errors/codes/auth-unauthorized) | 401 |
| [`auth.forbidden`](https://docs.morapay.io/errors/codes/auth-forbidden) | 403 |
| [`auth.keys.invalid`](https://docs.morapay.io/errors/codes/auth-keys-invalid) | 401 |
| [`auth.keys.revoked`](https://docs.morapay.io/errors/codes/auth-keys-revoked) | 401 |
| [`auth.keys.expired`](https://docs.morapay.io/errors/codes/auth-keys-expired) | 401 |
| [`auth.keys.legacy_unsupported`](https://docs.morapay.io/errors/codes/auth-keys-legacy-unsupported) | 401 |
| [`auth.keys.secret_in_header`](https://docs.morapay.io/errors/codes/auth-keys-secret-in-header) | 401 |
| [`auth.keys.origin_not_allowed`](https://docs.morapay.io/errors/codes/auth-keys-origin-not-allowed) | 403 |
| [`auth.signature.mismatch`](https://docs.morapay.io/errors/codes/auth-signature-mismatch) | 401 |
| [`auth.signature.timestamp_expired`](https://docs.morapay.io/errors/codes/auth-signature-timestamp-expired) | 401 |
| [`auth.signature.incomplete`](https://docs.morapay.io/errors/codes/auth-signature-incomplete) | 401 |
| [`auth.signature.missing`](https://docs.morapay.io/errors/codes/auth-signature-missing) | 401 |
| [`auth.signature.invalid_timestamp`](https://docs.morapay.io/errors/codes/auth-signature-invalid-timestamp) | 401 |
| [`auth.signature.invalid_format`](https://docs.morapay.io/errors/codes/auth-signature-invalid-format) | 401 |

### KYB and permissions

| Code | HTTP |
| - | - |
| [`kyb.forbidden`](https://docs.morapay.io/errors/codes/kyb-forbidden) | 403 |
| [`kyb.blocked`](https://docs.morapay.io/errors/codes/kyb-blocked) | 403 |

### Payment links

| Code | HTTP |
| - | - |
| [`links.amount.below_minimum`](https://docs.morapay.io/errors/codes/links-amount-below-minimum) | 422 |
| [`links.slug.duplicate`](https://docs.morapay.io/errors/codes/links-slug-duplicate) | 409 |

### Payouts and treasury

| Code | HTTP |
| - | - |
| [`payouts.momo.insufficient_balance`](https://docs.morapay.io/errors/codes/payouts-momo-insufficient-balance) | 400 |
| [`payouts.network.carrier_down`](https://docs.morapay.io/errors/codes/payouts-network-carrier-down) | 503 |
| [`payouts.clearing.refund_failed`](https://docs.morapay.io/errors/codes/payouts-clearing-refund-failed) | 500 |

### Crypto checkout

| Code | HTTP |
| - | - |
| [`crypto.chain.unsupported`](https://docs.morapay.io/errors/codes/crypto-chain-unsupported) | 422 |
| [`crypto.slippage.exceeded`](https://docs.morapay.io/errors/codes/crypto-slippage-exceeded) | 422 |

### Resources and validation

| Code | HTTP |
| - | - |
| [`resource.not_found`](https://docs.morapay.io/errors/codes/resource-not-found) | 404 |
| [`resource.conflict`](https://docs.morapay.io/errors/codes/resource-conflict) | 409 |
| [`request.invalid`](https://docs.morapay.io/errors/codes/request-invalid) | 400 |
| [`request.validation_failed`](https://docs.morapay.io/errors/codes/request-validation-failed) | 422 |

### Platform and connectivity

| Code | HTTP |
| - | - |
| [`api.rate_limited`](https://docs.morapay.io/errors/codes/api-rate-limited) | 429 |
| [`api.service_unavailable`](https://docs.morapay.io/errors/codes/api-service-unavailable) | 503 |
| [`api.internal_error`](https://docs.morapay.io/errors/codes/api-internal-error) | 500 |
| [`api.bad_gateway`](https://docs.morapay.io/errors/codes/api-bad-gateway) | 502 |
| [`api.gateway_timeout`](https://docs.morapay.io/errors/codes/api-gateway-timeout) | 504 |
| [`api.connection_failed`](https://docs.morapay.io/errors/codes/api-connection-failed) | 502 |
| [`api.proxy.core_unconfigured`](https://docs.morapay.io/errors/codes/api-proxy-core-unconfigured) | 503 |
| [`api.proxy.signing_unconfigured`](https://docs.morapay.io/errors/codes/api-proxy-signing-unconfigured) | 503 |
| [`api.proxy.core_unreachable`](https://docs.morapay.io/errors/codes/api-proxy-core-unreachable) | 502 |

## Next step

[Get help](https://docs.morapay.io/support/get-help.md): how to reach support with the right context.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.