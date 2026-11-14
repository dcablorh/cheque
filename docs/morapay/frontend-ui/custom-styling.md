> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Custom styling

> Match Morapay UI components to your brand with tokens and Tailwind.

Morapay UI components are designed to **inherit your font stack** while owning severity colors, spacing, and motion.

## CSS custom properties for `@morapay/react`

```css theme={null}
:root {
  --morapay-error-critical: #ef4444;
  --morapay-error-warning: #f59e0b;
  --morapay-error-info: #3b82f6;
  --morapay-error-radius: 12px;
  --morapay-error-font: inherit;
}
```

`MorapayErrorView` will read these before applying built-in defaults.

## Tailwind `className` slots

```tsx theme={null}
<MorapayErrorView
  error={error}
  className="mt-4 rounded-xl border border-zinc-200"
  theme="light"
/>
```

Severity colors come from Morapay tokens unless you override via `className` on the outer wrapper.

## Vanilla toast styling today

`MorapayUi.toast()` injects self-contained styles (no Tailwind required). Customize behavior via options:

```typescript theme={null}
MorapayUi.toast(err, {
  durationMs: 8000,
  position: "bottom-center",
  onAction: () => router.refresh(),
});
```

Positions: `top-right` (default), `top-center`, `bottom-right`, `bottom-center`.

## Checkout widget theming

Pass theme params when opening the hybrid modal:

```javascript theme={null}
MorapayCheckout.openModal({
  mode: "payment-link",
  publicCode: "abc123",
  theme: "velvet-obsidian",
  accentColor: "#6366F1",
  borderRadius: "lg",
  fontScale: "default",
});
```

Preview/staging mode (`openPreviewModal`) supports design iteration without live charges. See the SDK sample app.

## What not to style

The **inner checkout canvas iframe** (`checkout.morapay.io`) controls PCI-sensitive fields. Style the outer native shell and error components; do not attempt to inject CSS into the secure canvas.

## Next step

[Error handling](https://docs.morapay.io/errors/error-handling.md). `displayMessage` vs `message` and `uiHint` severity levels.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.