> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Get help

> How to reach Morapay support and get unblocked fast.

When you're stuck, we want you back to a **200 OK** as fast as possible. Format your question well and include the right identifiers.

## Response times

| Channel | Expected response | Best for |
| - | - | - |
| **Morapay Sandbox** (community) | Hours (business days) | Integration questions, code snippets |
| **[support@morapay.io](mailto:support@morapay.io)** | 1 business day | Account, LIVE incidents, security |
| **Dashboard chat** | Varies by plan | Billing, KYB, key management |

## Always include

1. **`requestId`**: from the error body or `Morapay-Request-Id` response header. Every API request is logged with this ID.
2. **Environment**: TEST or LIVE (from your key prefix).
3. **Endpoint + SDK method**, for example `morapay.products.link()`, `POST /disbursement/batches`.
4. **Timestamp**: when the failure occurred.
5. **Error `code`**, for example `links.amount.below_minimum`, not just HTTP 422.

### Good support request

```
requestId: req_1717483920_x7k2
env: TEST
call: morapay.disbursement.quote({ chainId: 8453, token: "USDC", payoutTotal: 250, recipientCount: 10 })
code: payouts.momo.insufficient_balance
time: 2026-03-15T14:32:00Z
```

### Avoid

* Pasting `sk_*` secret keys (never share secrets)
* Screenshots without `requestId`
* Re-serialized webhook bodies for signature debugging (send raw body + signature header instead)

## Self-serve resources

> [card] [Error catalog](https://docs.morapay.io/errors/error-handling.md)
>
> Consultant fields, subclasses, and UI hints.

> [card] [Authentication](https://docs.morapay.io/getting-started/authentication.md)
>
> HMAC signing reference.

> [card] [SDK sample app](https://github.com/morapay/morapay-web/tree/main/sdk/sample/nextjs)
>
> Next.js integration lab.

> [card] [Sandbox community](https://sandbox.morapay.io)
>
> Ask engineers in the developer group.

## Security issues

Report vulnerabilities to **[security@morapay.io](mailto:security@morapay.io)**. Do not open public GitHub issues for security disclosures.

> [!NOTE]
>
> For signature verification help, post your canonical signing string construction (without `sk_*`) and the `requestId` of a failed call. Our team can trace the exact API log entry.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.