> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# React hooks & components

> @morapay/react package: drop-in error and checkout UI.

> [!WARNING]
>
> **`@morapay/react` is not published yet.** This page documents the planned API from `sdk/react/README.md`. Use `@morapay/sdk` + `MorapayUi.toast()` today.

## Installation

```bash theme={null}
pnpm add @morapay/react @morapay/sdk
```

Peer dependencies: `react` ≥ 18, `react-dom`, `@morapay/sdk`.

## `MorapayErrorView`

Renders nothing when `error` is null. Reads `displayMessage` and `uiHint` from `MorapayError`:

```tsx theme={null}
"use client";

import { useState } from "react";
import { MorapayErrorView } from "@morapay/react";

export function CheckoutForm() {
  const [error, setError] = useState<unknown>(null);

  async function onSubmit() {
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const json = await res.json();
      if (!json.success) setError(json);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <MorapayErrorView error={error} theme="light" onAction={() => setError(null)} />
      <button type="submit">Pay now</button>
    </form>
  );
}
```

### Placement routing

| `uiHint.placement` | Component behavior |
| - | - |
| `inline` | Alert banner in document flow |
| `toast` | Delegates to `MorapayUi.toast` |
| `modal` | `MorapayErrorModal` with focus trap |

## `useMorapayError`

```tsx theme={null}
const { error, setError, clearError, viewProps } = useMorapayError();

try {
  await createLinkAction();
} catch (e) {
  setError(e);
}

return <MorapayErrorView {...viewProps} />;
```

## Next.js App Router pattern

Server Actions should return serializable error payloads; never throw raw `sk_*` errors to the client:

```typescript theme={null}
"use server";
import { Morapay, isMorapayError } from "@morapay/sdk";

export async function createLinkAction() {
  const morapay = new Morapay({ /* keys from env */ });
  try {
    const link = await morapay.link.create({ title: "Order", amount: 50, currency: "USD" });
    return { ok: true, data: link };
  } catch (err) {
    if (isMorapayError(err)) {
      return {
        ok: false,
        error: {
          code: err.code,
          displayMessage: err.displayMessage,
          safeMessage: err.safeMessage,
          uiHint: err.uiHint,
          requestId: err.requestId,
        },
      };
    }
    throw err;
  }
}
```

## Roadmap

* [ ] `MorapayErrorView` + `MorapayErrorModal`
* [ ] `useMorapayError` hook
* [ ] Storybook matrix (severity × placement)
* [ ] Sample integration in `sdk/sample/nextjs`

## Next step

[Custom styling](https://docs.morapay.io/frontend-ui/custom-styling.md): CSS variables and Tailwind `className` slots.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.