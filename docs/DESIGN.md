# Cheque Design System

> Vintage park-poster on cream paper, with a bank cheque at the centre. Warm, flat and printed, but serious about money.

Everything here is already implemented in `frontend/`. When you build or change a screen, match this file. When this file and the code disagree, fix whichever is wrong in the same change.

Source of truth in code:

| What | Where |
|---|---|
| Colors, fonts, shadows, animations | `frontend/tailwind.config.ts` |
| Buttons, fields, cards, labels | `frontend/src/app/globals.css` (`@layer components`) |
| Shared components | `frontend/src/components/ui.tsx` |
| Signature pad, scale-to-fit | `SignaturePad.tsx`, `ScaleToFit.tsx` |

## 1. Principles

1. **Paper, not SaaS.** The canvas is warm cream. Pure white and pure black are not used.
2. **One green.** Meadow green means "do this" (the primary action) and nothing else. It also colors the second line of a two-color headline.
3. **Type is the loudest thing.** Headlines are huge, condensed and tightly packed. Body text stays calm.
4. **Flat and printed.** No gradients, no glass, no glow. Badges and stickers have no shadow.
5. **The cheque is the hero.** It is always drawn as a long landscape cheque, never a tall card, at every screen width.
6. **Plain money words.** Say what happens: "Write a cheque", "Share the link", "Whoever holds the link can claim it".

## 2. Color

Use the Tailwind token, never a raw hex, except inside SVG art.

| Token | Hex | Use |
|---|---|---|
| `paper` | `#f3ede4` | Page background, light sections |
| `night` (DEFAULT) | `#122315` | Hero and dark bands, nav, footer, heading text, primary text on green |
| `night-800` / `night-700` | `#1a3320` / `#233f2a` | Cards on a dark band, hover on dark |
| `navy` | `#0a071b` | Badge and illustration dark fill only |
| `ink` / `ink-soft` / `ink-mute` | `#122315` / `#333333` / `#626d66` | Body text, secondary text, helper text |
| `sage` | `#566053` | Borders and dividers on cream, labels |
| `moss` | `#999c91` | Placeholder text, captions on dark |
| `brand-500` | `#55dd4a` | **Primary action fill.** Accent headline words, eyebrow on dark |
| `brand-600` | `#45c43a` | Hover for the primary action |
| `brand-700` | `#2b8a24` | Green text on cream (links, success text), readable contrast |
| `brand-50` / `100` / `200` | light greens | Success and "paid" tints |
| `river` | `#73d3eb` | Illustration water only; info badge tint |
| `sun` | `#ffed52` | Illustration sun and warm "pending" tint only |
| `cedi` | `#c8402f` | Errors and destructive actions only |

Rules:
- Do not add a second chromatic accent. `river` and `sun` are decoration and status tints, never buttons.
- Text on cream is `night` or `ink-soft`. Text on dark is `paper`, with `paper/70` to `paper/80` for body.
- Never place the green button on a green surface. On green sections use a `night` button.
- Status colors: success = `brand`, waiting = `sun`, in progress = `river`, problem = `cedi`, neutral = `night/5` with `sage` ring.

## 3. Typography

| Role | Font | Notes |
|---|---|---|
| Display | **Anton** (stand-in for Deacon), its single black weight, uppercase | `font-serif` in Tailwind maps to it. Use the `.display` class — it sets no weight on purpose |
| Body and UI | **Inter**, 400 and 500 | `font-sans` |
| Codes, numbers on the cheque | **DM Mono**, 400 and 500 | `font-mono`. Cheque number, the number strip |
| Signature (fallback) | Snell Roundhand / Segoe Script / Brush Script | Only on the cheque, when nothing is drawn |

Motion: sections fade and rise in via `<Reveal>` (IntersectionObserver adds `.in`; stagger siblings with `delay`). Corridor pills ticker uses `.marquee-track` (pauses on hover). Everything opts out under `prefers-reduced-motion`.

Display rules:
- Always use `.display`: uppercase, `leading-[.85]`, tracking `-.01em`. For the hero use `!leading-[.9]`.
- Never set display text above `leading-[.95]` or below weight 700.
- Sizes: hero `clamp(56px, 12vw, 170px)`, section opener `clamp(56px, 9vw, 137px)`, sub-heading `clamp(44px, 6vw, 72px)`, card heading 32 to 48px.
- A hero is two lines. The second line is `text-brand-500` on dark.

Labels and small text:
- `.eyebrow`: 12px, uppercase, `tracking-[.22em]`, medium.
- `.label` (form labels): 12px, uppercase, `tracking-[.18em]`, `text-sage`. In dense forms use `!text-[10px] !mb-1`.
- Body: 16px, `leading-relaxed`. Helper text: 12 to 14px, `ink-mute`.
- Numbers that change (amounts, totals) use `tabular-nums`.

## 4. Spacing, layout, shape

- Base unit 4px. Common steps: 8, 12, 16, 20, 24, 32, 48, 64, 96.
- Page content max width: **1200px** (`max-w-[1200px]`), centered, `px-5`. Reading text and FAQ: 900px. App pages: `max-w-4xl`. Claim page: `max-w-md`.
- Section rhythm: 96 to 112px vertical (`py-24` to `py-28`). Sections alternate `paper` and `night`.
- Radius: **cards and badges 20px**, **buttons, fields, small panels 10px**, circular patches fully round. Nothing larger than 20px.
- Borders: 1px `sage` on cream, `sage/40` on dark. Cheque uses `night/40`.
- Dividers between list rows: `divide-sage/50`.

## 5. Elevation

Only three shadows exist:

| Name | Value | Use |
|---|---|---|
| `shadow-card` | `0 12px 40px rgba(10,7,27,.12)` | Cards on cream |
| `shadow-cheque` | `0 12px 40px rgba(10,7,27,.28)` | The cheque |
| `shadow-chip` | `0 8px 24px rgba(10,7,27,.18)` | The floating "Write a cheque" chip |

Badges, stickers, buttons and text blocks never get a shadow.

## 6. Components

### Buttons (`.btn-*`)
All buttons: 13px, medium, uppercase, `tracking-[.18em]`, radius 10px, padding `py-3.5 px-7`, `active:scale-[.98]`, focus ring in `night` with an offset, disabled at 50% opacity.

| Class | Look | Use |
|---|---|---|
| `.btn-primary` | Meadow fill, `night` text | The one main action per view: "Write a cheque", "Issue cheque", "Claim" |
| `.btn-ghost` | 1px `night/70` outline, transparent | Secondary: Cancel, Log in |
| `.btn-danger` | `cedi` outline | Cancel and refund |
| On dark | Ghost becomes `border-paper text-paper hover:bg-paper/10`; set `focus-visible:ring-offset-night` | Nav and hero |

Compact buttons in the nav use `!px-5 !py-2.5`. Only one primary button per screen section.

### Fields (`.field`, `.label`)
Radius 10px, 1px `sage/60` border, background `#faf7f1`, `placeholder:text-moss`, focus: `night` border plus a 2px meadow ring. Compact form fields: `!px-3 !py-2.5 !text-sm`. A currency symbol inside an input needs `!pl-8` so digits never sit under it. Validation text sits under the field in 11 to 12px; errors are `cedi` and semibold.

### Cards (`.card`)
Radius 20px, 1px `sage` border, background `#faf7f1`, `shadow-card`. Padding 16 to 32px. List cards lift 2px on hover.

### Status pill (`StatusPill`)
Pill, 11px, uppercase, `tracking-[.16em]`, ring-inset. Tones: green (Ready to claim, Paid), amber/sun (Funding, pending), blue/river (Paying out), red/cedi (Under review), gray (Cancelled, Expired, Refunded). States and labels live in `STATE_LABEL` in `lib/api.ts`. Never invent labels in a screen.

### States and loading

- **Success** — `SuccessNote` (meadow border, check icon). Full moments (cheque delivered) get a meadow disc with a check plus the stamped cheque.
- **Failure** — `ErrorNote` for inline errors; `FailureNote` for titled failures (manual payout recovery). Dead cheques get the night disc with a meadow icon on a plain card.
- **Processing** — `ProcessingRail`: flat meadow step rail (done fills, active pulses, upcoming hollow) used while a payout or escrow redeem is in flight. Short waits use `DotsLoader` (three meadow dots).
- **Loading layouts** — `Skeleton` blocks shaped like the content they stand in for: a cheque-shaped block on the claim page, `h-[76px]` rows in the cheque list. Never a bare spinner for a full screen.
- **Sharing** — the share panel offers Copy, WhatsApp (primary), Telegram and Email intents. No SMS.

### Error note (`ErrorNote`)
10px radius, `cedi/40` border, `cedi/5` fill, `cedi` text. Use `role="alert"`.

### Logo
Wordmark "cheque." in the display font, lowercase, with a meadow period. `tone="light"` on dark. No icon, no coin.

### Nav
Sticky, 64px, `night` background, no bottom border. Left: logo. Right: ghost "Log in" and primary "Write a cheque", plus the wallet button when connected state exists. No text link row. Footer is `night` with the logo, one line of description and a "Get started" column.

### Patch badge (`Patch`)
120 to 160px circle, `navy` fill, 2.5px `paper` ring, dashed inner ring, a flat icon (star, coin, chat, globe) and curved caption in the display font. Rotated 8 to 10 degrees, gently bobbing, no shadow. Use only when an abstract idea needs a picture. Do not place patches around the hero cheque.

### Sticker
Meadow fill, `night` text, 12px uppercase, sharp corners, rotated 4 to 8 degrees, overlapping its parent by at least 20%.

### Landscape and map art
Flat shapes in the illustration palette (`navy`, `brand`, `river`, `sun`, `paper`). No gradients, no perspective. Anchors the bottom of dark heroes and claim headers.

## 7. The cheque (`ChequePaper`)

The cheque is the product. Keep it consistent everywhere (landing, new cheque preview, share screen, claim page).

- **Shape:** a long landscape ticket, 720px design width, scaled to fit its container by `ScaleToFit` (up to 1.25x). It never reflows or stacks on small screens.
- **Surface:** warm cream `#f4efe0`, guilloche wave pattern at 16% opacity, thin inner border, radius 10px, `shadow-cheque`.
- **Layout, top to bottom:** logo and "Cross-border cheque" left; cheque number (`No. CHQ-XXXXXX`, mono) and date right; "Pay to the order of" with the payee in display type; currency code and a boxed amount on the right; the amount in words on its own line; memo left; signature right; a number strip at the bottom.
- **Amount in words** (`amountInWords`): spelled out with local units, no fractions. "Five hundred ninety dollars", "One thousand two hundred cedis and fifty pesewas", "Seventy-five thousand naira and one kobo". Blank until an amount is entered.
- **Cheque number:** `CHQ-` plus 6 characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. The preview number is the issued number.
- **Date:** today on the preview, creation date afterwards. Format `13 Nov 2026`.
- **Signature:** the drawn PNG if present, otherwise the sender's name in script type.
- **Stamp:** "Paid" in the display font on a meadow block, rotated about -6 degrees, only for settled cheques.

## 8. Screens

### Landing (`/`)
Dark hero with the display headline "If you can send a message, you can send money." (second line green), a short sub-line, one primary button, and the cheque below on a cream band. Then: how it works (numbered rows), countries, why, escrow, pricing, FAQ, final green call to action, footer. Dark and cream sections alternate. One idea per section.

### Sender app (`/app`)
Cream. List of cheques as cards with the payee in display type, mono code, status pill and amount. New cheque: the long cheque preview on top, a compact two-column form below (left: country, name, amount, note, expiry; right: tall signature pad), then the total and the primary button. Share screen: the cheque, then the claim link, copy button and WhatsApp button.

### Claim (`/c/[token]`)
Narrow column. Dark header with the logo and a landscape strip, the cheque overlapping the header edge, a countdown, then one card with one action: Claim, then choose where the money goes.

## 9. Motion

- Entrance: `animate-rise` (14px up, fade, 0.6s, `cubic-bezier(.2,.8,.2,1)`), staggered by 60 to 100ms per element in heroes.
- `animate-float` for the hero cheque only. `animate-bob` for patches. `animate-stamp` for the stamp.
- Buttons press to 98%. Hover color changes only; no movement except list cards.
- Always respect `prefers-reduced-motion` (already handled in `globals.css`). New animations must be added to that block.

## 10. Content and voice

- Short, direct, no hype. Headlines make one claim.
- Tagline: **If you can send a message, you can send money.**
- Core promise: write a cheque, share the link, whoever holds the link can claim it.
- Name the amount and the action on buttons: "Claim GH₵500.00", "Issue cheque".
- Money is shown with its currency symbol and two decimals via `fmtMoney`. Countries: Ghana (GHS, ₵), Nigeria (NGN, ₦), United States (USD, $). Deposits settle in USDC.
- Never say "blockchain" to the recipient. Say "escrow" and "Stellar" sparingly, in small print.
- Warn plainly where it matters: anyone holding the link can claim, so send it only to the person it is for.

## 11. Accessibility

- Text contrast: `night` on `paper` and `paper` on `night` pass AA. Do not use `moss` for text smaller than 14px on cream; use `ink-mute`.
- Every interactive element has a visible focus ring (built into `.btn` and `.field`).
- Images and canvases need labels: the signature pad has `aria-label`, the signature image has alt text, decorative SVG art is `aria-hidden`.
- Forms: every input has a `<label>` with `htmlFor`. Errors use `role="alert"`.
- Touch targets at least 40px high. Pointer drawing uses `touch-none` on the pad only.

## 12. Do and don't

**Do**
- Use `.display` for every big heading and `.eyebrow` for kickers.
- Keep one primary (meadow) button per view.
- Use cream for content, night for bands, and alternate them.
- Keep radii at 10px (controls) and 20px (cards).
- Use the shared components in `ui.tsx` before writing new markup.

**Don't**
- No gradients, glass blur, glow or colored shadows.
- No second accent color, no purple, no blue buttons.
- No pure white or pure black backgrounds or text.
- No rounded-full buttons, no corners above 20px on cards.
- No tall stacked cheque, no emoji as icons (use `lucide-react`).
- No shadows on badges and stickers.
- No new fonts, sizes or colors without adding them here and to `tailwind.config.ts`.

## 13. Adding something new

1. Check this file and `ui.tsx` for an existing pattern.
2. Use only existing tokens. If a token is missing, add it to `tailwind.config.ts` and document it in section 2.
3. Build it flat, with the display font for headings and the meadow button for the one action.
4. Check it at 375px, 768px and 1280px wide.
5. Update this file in the same change.
