> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Native components

> Intent-driven errors and checkout UI without nested iframe modals.

Morapay is designed so merchants ship **native-feeling** checkout and error UI: components live in your DOM tree, inherit your typography, and avoid unpolished full-page iframe embeds.

## Philosophy

| Layer | What Morapay provides |
| - | - |
| **API** | Intent-driven error payloads (`displayMessage`, `uiHint`) |
| **SDK** | `MorapayUi.toast()` for vanilla JS |
| **Checkout widget** | Hybrid modal: native shell + secure canvas iframe for PCI/MoMo |
| **`@morapay/react`** | Drop-in React components \*\* |

## Error UI today

Every API error includes a rendering blueprint:

```json theme={null}
{
  "displayMessage": "The transaction amount must be at least 1.00 GHS.",
  "uiHint": {
    "severity": "warning",
    "placement": "inline",
    "actionText": "Update amount"
  }
}
```

### Vanilla toast

```typescript theme={null}
import { MorapayUi } from "@morapay/sdk";

try {
  await morapay.products.link("prod_123", { amount: 0.5, currency: "GHS" });
} catch (err) {
  MorapayUi.toast(err, {
    onAction: () => recalculateCart(),
  });
}
```

`morapay.ui.toast(err)` is equivalent. Toasts are \*\***browser-only**; they no-op when `document` is unavailable (server-side).

### Placement hints

| `uiHint.placement` | When to use |
| - | - |
| `inline` | Form validation: render under the input |
| `toast` | Transient network or rate-limit errors |
| `modal` | Critical payout or permission failures |

## Checkout widget

Load the widget from your checkout host:

```html theme={null}
<script src="https://checkout.morapay.io/widget/morapay-checkout.js"></script>
<script>
  MorapayCheckout.openModal({
    mode: "payment-link",
    publicCode: "abc123",
    onSuccess: (payload) => console.log("paid", payload),
  });
</script>
```

**Not a full-page iframe.** The outer modal is native (Shadow DOM on your page). Only the card/MoMo/KYC canvas runs inside a secure iframe (`?hybrid=1&canvas=1`).

Server-side URL helpers:

```typescript theme={null}
morapay.buildPaymentLinkEmbedUrl("abc123", { flow: "onramp" });
morapay.buildBusinessPayWidgetUrl("acme-store");
```

> [!NOTE]
>
> `@morapay/react` will wrap `MorapayErrorView`, checkout forms, and hooks. See the [React hooks](https://docs.morapay.io/frontend-ui/react-hooks.md) page for the planned API.

## Next steps

> [card] [React hooks](https://docs.morapay.io/frontend-ui/react-hooks.md)
>
> Planned `@morapay/react` component API.

> [card] [Custom styling](https://docs.morapay.io/frontend-ui/custom-styling.md)
>
> Theme tokens and Tailwind integration.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.