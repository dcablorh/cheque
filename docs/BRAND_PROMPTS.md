# sencheq: Brand Asset Prompts

Prompts for generating the logo, app icons, favicon, social images and the icon set. Every prompt is built from `DESIGN.md` so the assets match the product.

Use these with an image model (Midjourney, Ideogram, Recraft, or the image tool in your model). For the logo, use the vector output (SVG) from Recraft or a designer, not a raster image. Logos need to scale from 16px to billboard size.

## 0. Brand facts (paste into every prompt)

- **Name:** sencheq (always lowercase in the wordmark: `sencheq`, with a meadow-green full stop: `sencheq.`)
- **Product:** cross-border digital cheques for Ghana, Nigeria and the United States, settled in USDC on Stellar. Money is held in escrow until the person holding the link claims it.
- **Tagline:** If you can send a message, you can send money.
- **Mood:** vintage national-park poster meets a bank cheque. Warm, flat, printed, serious about money. Not neon, not glossy, not crypto-flashy.
- **Palette (use only these):**
  - Forest ink `#122315` (main dark)
  - Paper cream `#f3ede4` (main light)
  - Meadow green `#55dd4a` (the one accent, primary action)
  - Deep navy `#0a071b` (badge fill)
  - River blue `#73d3eb` (water and sky accent)
  - Sun yellow `#ffed52` (sun accent, decoration only)
  - Sage `#566053` (secondary lines)
- **Type:** condensed display sans (Antonio or similar), uppercase, tight leading. Clean geometric sans for small text. Mono for codes.
- **Shapes:** flat fills, no gradients, no glow, no drop shadows, no 3D. Corners: 10px on squares, circles for badges.

## 1. Primary logo (wordmark)

**Prompt:**
> Vector wordmark logo for "sencheq" with a full stop. Lowercase, condensed heavy sans-serif letterforms, uppercase feel but drawn in lowercase, very tight letter spacing, sturdy and warm like a vintage bank cheque or national park poster. The letters are solid forest green `#122315` on a transparent background. The full stop after the word is a single solid meadow green `#55dd4a` circle. Flat, no gradient, no shadow, no outline, no texture. Balanced optical spacing, clean edges, works in one colour. Minimal, confident, memorable. Vector, SVG, centred on a square canvas with generous padding.

**Negative:** no gradients, no 3D, no glow, no coins, no dollar or cedi symbols in the logo, no stock-bank imagery, no drop shadow, no script font, no crypto icons.

**Reversed version (for dark backgrounds):**
> Same wordmark for "sencheq", letters in paper cream `#f3ede4`, full stop in meadow green `#55dd4a`, transparent background, flat vector.

**Monochrome version:** the same wordmark in a single colour (forest green or white) with no green full stop, for print and favicons where colour is not available.

## 2. Monogram and app icon

The app icon uses a single "s" with the full stop, inside a rounded square.

**Prompt:**
> App icon, 1024x1024. Rounded square background in forest ink `#122315`, with a rounded corner radius around 22 percent. Centred, a bold lowercase letter "s" in paper cream `#f3ede4`, condensed heavy sans-serif, tall and tight. Beside its baseline, a small solid meadow green `#55dd4a` dot, like a full stop. Flat vector, no gradient, no shadow, no texture, no border. Simple, legible at 29px. Confident and minimal.

**Variants to generate:**
- Light: cream `#f3ede4` background, forest green letter, meadow dot.
- iOS and Android safe version: the same, letter scaled to 60 percent of the canvas so launchers can crop it.

**Negative:** no words other than the letter, no cheque picture inside the icon (too busy at small size), no gradients, no rounded-corner stroke.

## 3. Favicon set

**Prompt:**
> Favicon for "sencheq", square, designed for 16x16 and 32x32 pixels. A bold lowercase "s" filling most of the square, forest green `#122315` on paper cream `#f3ede4`, with a meadow green `#55dd4a` dot in the bottom-right corner. No detail that disappears at small size. Flat, no gradient, no outline. Export also as a 180x180 touch icon and a 512x512 PWA icon.

## 4. Cheque mark (symbol without the word)

A small emblem that stands for a cheque, used on loading screens, empty states and the share page.

**Prompt:**
> Symbol for a digital cheque, flat vector. A small rectangular ticket shape with two notch cuts on the sides like a torn cheque, drawn in forest green `#122315` outlines with a single meadow green `#55dd4a` band across the top. Inside, one short horizontal line for the payee and one small square for the amount. No text. Simple enough to read at 24px. No shadow, no gradient, no perspective.

## 5. Icon set

Line icons, consistent stroke, used across the app. Style them to match `lucide-react` as close as possible so the app can keep using that library. If custom icons are needed, use this style.

**Global style prompt (prefix every icon prompt with this):**
> Flat line icon, 24x24 grid, 2px stroke with rounded caps and joins, forest green `#122315` strokes, no fill except a single optional meadow green `#55dd4a` accent shape, no gradients, no shadows, no text, transparent background. Monoline, geometric, slightly warm, matching a vintage poster. Export as SVG.

**Icons needed:**

| Icon | Describe to the model |
|---|---|
| Write cheque | a pen tip on a small cheque ticket |
| Share link | two chain links, one slightly offset, with a small arrow |
| Claim | a hand holding a small ticket, or an open palm receiving a cheque |
| Escrow / held | a padlock with a simple keyhole and a small tick |
| Expiry | a simple clock face with one hand near the top |
| Cancel | a circle with a diagonal line through a small cheque |
| Refund | a curved arrow returning to a small cheque |
| Wallet | a flat wallet with a fold and a small meadow green clasp |
| USDC | a round coin with a simple dollar-like "$" mark, no real USDC logo |
| Cedi (GHS) | a single "₵" glyph in a round outline |
| Naira (NGN) | a single "₦" glyph in a round outline |
| Dollar (USD) | a single "$" glyph in a round outline |
| Verified | a small shield with a tick |
| Mobile money | a phone with a small banknote |
| Bank transfer | a simple bank building with a column front |
| Copy | two overlapping rectangles |
| WhatsApp / chat | a speech bubble with a tail, no brand logo |
| Stellar | a simple star with a ring, drawn generically, not the official Stellar mark |
| Sign out | a door with an arrow leaving |
| Warning | a triangle with an exclamation mark |
| Success | a circle with a tick |

**Negative for icons:** no emoji look, no brand logos (WhatsApp, Stellar, Circle, Freighter, etc.), no 3D, no gradients, no filled blobs.

## 6. Badge patches (decorative)

Circular enamel-pin style badges. Used sparingly on the landing page.

**Shared prompt base:**
> Circular enamel-pin style badge, 512x512, flat vector. Outer circle filled deep navy `#0a071b`, a thin cream `#f3ede4` outer ring, and a fine dashed inner ring in cream. Central illustration uses only: deep navy, meadow green `#55dd4a`, river blue `#73d3eb`, sun yellow `#ffed52`, and paper cream `#f3ede4`. Flat shapes, no gradient, no shadow, simple and slightly naive in proportion. Leave space along the outer ring for a curved caption.

**Badges to generate:**
- **Settled on Stellar:** a meadow green star with a cream ring orbiting it, sun yellow highlight.
- **Send in any chat app:** two speech bubbles, one green, one cream.
- **Across borders:** a simple globe with a cream dashed route line between two dots.
- **Good for the planet:** a pine tree on a small hill, river blue water below.
- **Fast as water:** three wavy river-blue lines over a cream base.
- **Cash out locally:** three overlapping coins (cedi, naira, dollar symbols) in green, sun and river blue.

**Negative:** no shadows, no text inside the circle (the caption goes around the ring), no more than five colours, no flags, no national emblems.

## 7. Landscape illustration (hero and headers)

A flat park-poster landscape: mountains, pine forest, a river and a sun. Used under the hero and in the claim header.

**Prompt:**
> Flat vector landscape illustration, 1440x420, wide panoramic. Layered snow-capped mountains in deep navy `#0a071b` with cream `#f3ede4` peaks. A sun yellow `#ffed52` disc in the upper right. A row of pine trees in meadow green `#55dd4a` and darker green, sitting on a river. The river is river blue `#73d3eb` with two cream wave lines. The bottom edge is a flat cream strip. No gradients, no perspective vanishing point, no texture, no shadow, hand-drawn simplicity, slightly naive proportion, like a vintage national park poster.

**Negative:** no photographs, no people, no realistic lighting, no fog gradients, no extra colours beyond the palette.

## 8. Social and marketing images

### Open Graph / link preview (1200x630)
> Social preview image, 1200x630. Forest ink `#122315` background. Large condensed uppercase headline in paper cream `#f3ede4`: "IF YOU CAN SEND A MESSAGE, YOU CAN SEND MONEY." The word "SEND MONEY." in meadow green `#55dd4a`. Bottom right, a flat cream cheque ticket tilted slightly, showing the wordmark "sencheq." and the amount "$500.00". A thin landscape strip along the bottom in flat navy and green. Flat, no gradients, no shadows on text.

### Avatar (400x400) for WhatsApp, Telegram, Instagram
> Use the app icon: forest ink rounded square with the cream "s" and meadow green dot. Centred, filling 70 percent of the frame, flat, no border.

### Banner (1500x500) for X, LinkedIn, Facebook
> Forest ink background, left side the wordmark "sencheq." in paper cream with the green full stop, right side the tagline "If you can send a message, you can send money." in condensed uppercase, cream with the word "money." in meadow green. A cream cheque ticket partly overlapping the right edge. Flat vector, no gradient.

## 9. Cheque artwork (for marketing only)

The product cheque is drawn by code (`ChequePaper`). Use these prompts only for marketing illustrations, never as the product itself.

> Flat illustration of a bank-style cheque lying at a slight angle on a warm cream surface. Cream paper with a fine wave-line security pattern in light green. A forest ink border. Payee line and amount box filled in with simple dark strokes, no readable names. A meadow green stamp "PAID" rotated slightly. Flat vector, no shadow, no gradient, no texture beyond the wave pattern.

## 10. Export checklist

For each asset, export:
- SVG (master), and PNG at 512, 1024 and 2048 px where relevant.
- Light and dark versions of the wordmark and the icon.
- A one-colour version of the wordmark.
- Check the wordmark at 16px and 24px. If the detail disappears, use the simplified mark instead.
- Confirm no colour outside the palette in section 0.

## 11. Before you publish

- The wordmark and icon are the brand. Redraw or refine any generated letterform by hand, so the "s" and the full stop are clean, balanced and yours.
- The fallback display font (Antonio) is open licence. Check the licence of any display font before using it in a logo.
- Check that no generated icon accidentally looks like an existing brand mark.
- Store final assets in `frontend/public/brand/` and update the favicon and metadata in `frontend/src/app/layout.tsx`.
- The app still shows "cheque." in code. Update the wordmark in `frontend/src/components/ui.tsx` (`Logo`), the page title and metadata, and the docs when the final logo is ready.
