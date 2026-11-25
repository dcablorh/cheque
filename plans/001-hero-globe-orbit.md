# 001 — Replace hero calculator with a spinning globe orbited by currency coins

- **Status**: DONE (executed; browser feel-check pending — see Verification)
- **Commit**: 964f599
- **Severity**: MEDIUM
- **Category**: Hero visual replacement (user-requested feature; motion design per AUDIT.md rules)
- **Estimated scope**: 3 files (1 new component, 2 edits), ~120 lines

## Problem

The landing-page hero (`frontend/src/app/page.tsx:212-221`) currently shows the static
`ChequeCalculator` widget. The product decision (user request, with reference
`.tmp/ref-target.png`) is to replace it with an animated hero visual: a globe spinning
with currency coins (₵ ₦ $ € £ ¥ ₹) orbiting around it — coins passing behind the globe
at the top of the orbit and in front of it at the bottom, like the reference image.

Current hero code (`frontend/src/app/page.tsx:203-222`):

```tsx
        <div className="relative z-10 mx-auto max-w-[1200px] px-5 pb-20 pt-14 text-center sm:pt-20">
          <h1 className="display mx-auto max-w-5xl text-[clamp(44px,8vw,118px)]">
            <span className="block animate-rise [animation-delay:60ms]">If you can send a message,</span>
            <span className="block animate-rise text-brand-700 [animation-delay:160ms]">you can send money.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-rise text-lg text-ink-soft [animation-delay:260ms]">
            Cross-border digital cheques. Send the link on WhatsApp, Telegram or Instagram. Your recipient needs no
            account and no app. Unclaimed cheques come straight back.
          </p>
          <div className="mx-auto mt-10 max-w-[560px] animate-rise [animation-delay:340ms]">
            <ChequeCalculator />
          </div>
          <a
            href="#how"
            className="mt-8 inline-flex animate-rise items-center gap-1.5 text-sm font-semibold text-ink [animation-delay:420ms] hover:text-brand-700"
          >
            See how it works <ChevronDown className="h-4 w-4" />
          </a>
        </div>
```

Imports at the top of the same file:

```tsx
import {
  ArrowRight,
  Check,
  ChevronDown,
  ...
} from 'lucide-react';
...
import { ChequeCalculator } from '@/components/ChequeCalculator';
```

## Target

A hero with: headline → subcopy → **two pill CTAs** (the calculator's "Write a cheque"
button was the only CTA, so CTAs come back) → the globe animation below.

The globe is a flat, brand-styled composition (the site's language is flat poster art —
see `CorridorMap` and `Patch` in `frontend/src/components/ui.tsx`; do NOT imitate the
painterly style of the reference image, only its composition):

- Navy disc (`#122315` = `night`) with stylized landmasses drifting leftward inside the
  circle — reads as a spinning globe.
- 7 coins orbit on a tilted ring (64°), clockwise, one lap every **14s**, `linear`
  (constant motion per AUDIT.md §2). The globe surface loops every **28s** — the 2:1
  ratio creates gentle parallax so the scene never looks mechanically locked.
- Coins are upright at all times and are genuinely occluded by the globe when behind it
  (CSS 3D `preserve-3d` z-sorting, not faked with z-index switches).
- Coins cycle the brand accents: `#55dd4a` (brand-500), `#ffed52` (sun), `#73d3eb` (river),
  symbols in dark ink `#122315`.
- All motion is `transform`-only (AUDIT.md §5). No JS, no new dependencies.
- Under `prefers-reduced-motion: reduce` the loops stop; the scene renders as a static
  arrangement (AUDIT.md §6).

### Exact files and end state

**1. New file `frontend/src/components/GlobeOrbit.tsx`** — full contents:

```tsx
/**
 * Hero visual: a flat brand-styled globe whose surface drifts leftward while seven
 * currency coins orbit it on a 64°-tilted ring. Coins pass behind the globe at the
 * top of the orbit and in front at the bottom (CSS 3D z-sorting via preserve-3d).
 * Pure CSS motion — transform only, no JS, no client component needed.
 */

const COINS = [
  { symbol: '₵', bg: 'bg-brand-500', angle: 0 },
  { symbol: '$', bg: 'bg-sun', angle: 360 / 7 },
  { symbol: '₦', bg: 'bg-river', angle: (2 * 360) / 7 },
  { symbol: '€', bg: 'bg-brand-500', angle: (3 * 360) / 7 },
  { symbol: '£', bg: 'bg-sun', angle: (4 * 360) / 7 },
  { symbol: '¥', bg: 'bg-river', angle: (5 * 360) / 7 },
  { symbol: '₹', bg: 'bg-brand-500', angle: (6 * 360) / 7 },
];

/** One half of the seamless map strip. Two copies sit side by side and loop. */
function MapHalf() {
  return (
    <svg viewBox="0 0 220 220" preserveAspectRatio="xMidYMid slice" className="h-full w-1/2" aria-hidden>
      <g fill="#73d3eb" fillOpacity=".4">
        <path d="M0 52 C26 44 52 54 58 78 C63 98 46 112 24 108 C10 105 0 96 0 88 Z" />
        <path d="M220 128 C196 120 172 130 168 150 C165 168 184 180 204 176 C214 174 220 168 220 158 Z" />
        <path d="M84 30 C108 22 132 32 136 50 C139 64 122 72 102 68 C88 65 78 48 84 30 Z" />
        <path d="M104 148 C126 140 150 148 152 166 C153 180 134 188 116 182 C104 178 98 162 104 148 Z" />
        <circle cx="160" cy="96" r="8" />
        <circle cx="52" cy="160" r="6" />
      </g>
    </svg>
  );
}

export function GlobeOrbit() {
  return (
    <div aria-hidden className="flex justify-center">
      <div className="max-[520px]:scale-[.7]">
        {/* The scene shares one 3D context so coins z-sort against the globe disc. */}
        <div className="relative h-[440px] w-[440px] [transform-style:preserve-3d]">
          {/* orbit guide ring — painted first, so it sits behind everything at z=0 */}
          <div className="absolute left-1/2 top-1/2 h-[167px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-sage/50" />

          {/* tilted orbit plane: coins live here */}
          <div className="absolute inset-0 [transform:rotateX(64deg)] [transform-style:preserve-3d]">
            <div className="absolute inset-0 animate-orbit-spin [transform-style:preserve-3d] [will-change:transform]">
              {COINS.map((c) => (
                <div key={c.symbol} className="absolute inset-0" style={{ transform: `rotateZ(${c.angle}deg)` }}>
                  <div
                    className="absolute left-1/2 top-1/2 h-14 w-14"
                    style={{ transform: 'translate(-50%, -50%) translateX(190px)' }}
                  >
                    {/* counter-spin with a negative delay cancels spin + arm angle, keeping the coin upright */}
                    <div
                      className="h-full w-full animate-orbit-spin-rev"
                      style={{ animationDelay: `${-(c.angle / 360) * 14}s` }}
                    >
                      {/* untilt so the coin faces the viewer */}
                      <div className="h-full w-full [transform:rotateX(-64deg)]">
                        <div className={`grid h-full w-full place-items-center rounded-full text-[22px] font-black text-night ring-2 ring-paper/60 ${c.bg}`}>
                          {c.symbol}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* the globe itself: navy disc, map strip drifting leftward inside it */}
          <div className="absolute left-1/2 top-1/2 h-[272px] w-[272px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-night ring-1 ring-night/10 [box-shadow:inset_-16px_-24px_48px_rgba(0,0,0,0.35)]">
            <div className="absolute inset-y-0 left-0 flex w-[200%] animate-globe-spin [will-change:transform]">
              <MapHalf />
              <MapHalf />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**2. `frontend/tailwind.config.ts`** — add three keyframes and three animation utilities
inside `theme.extend` (next to the existing `rise`/`fade`/`float`/`bob`/`stamp` entries,
which are the repo convention for keyframes):

```ts
      keyframes: {
        // ...existing rise/fade/float/bob/stamp stay untouched...
        'globe-spin': { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        'orbit-spin': { from: { transform: 'rotateZ(0deg)' }, to: { transform: 'rotateZ(360deg)' } },
        'orbit-spin-rev': { from: { transform: 'rotateZ(0deg)' }, to: { transform: 'rotateZ(-360deg)' } },
      },
      animation: {
        // ...existing entries stay untouched...
        'globe-spin': 'globe-spin 28s linear infinite',
        'orbit-spin': 'orbit-spin 14s linear infinite',
        'orbit-spin-rev': 'orbit-spin-rev 14s linear infinite',
      },
```

**3. `frontend/src/app/globals.css`** — extend the existing reduced-motion block (currently
lines 78-88) so the three new loops are covered:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-rise,
  .animate-fade,
  .animate-float,
  .animate-stamp,
  .animate-bob,
  .animate-globe-spin,
  .animate-orbit-spin,
  .animate-orbit-spin-rev {
    animation: none !important;
  }

  /* Keep state changes legible without movement. */
  .btn:active,
  .press:active {
    transform: none !important;
  }
}
```

**4. `frontend/src/app/page.tsx`** — three edits:

a) Delete the `ChequeCalculator` import (line 17) and delete `ChevronDown,` from the
   lucide-react import list (line 5). Keep `ArrowRight` — it is used again in step c.

b) Replace lines 212-221 (the widget div + "See how it works" anchor) with:

```tsx
          <div className="mx-auto mt-10 flex w-full max-w-md animate-rise flex-col gap-3 [animation-delay:340ms] sm:max-w-none sm:flex-row sm:justify-center">
            <Link href="/app" className="btn-primary w-full px-9 py-4 sm:w-auto">
              Write a cheque <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how"
              className="btn w-full border border-night/70 px-9 py-4 text-night hover:bg-night/5 sm:w-auto"
            >
              How it works
            </a>
          </div>
          <div className="mt-6">
            <GlobeOrbit />
          </div>
```

c) Add the import next to the other component imports (line 16 area):

```tsx
import { GlobeOrbit } from '@/components/GlobeOrbit';
```

## Repo conventions to follow

- Keyframes and animation utilities live in `frontend/tailwind.config.ts` under
  `theme.extend.keyframes` / `theme.extend.animation` (exemplar: the `rise`/`bob` entries
  already there). This plan adds to them rather than creating a parallel system.
- The house easing curve is `cubic-bezier(.2,.8,.2,1)` (`transitionTimingFunction.out`);
  it is NOT used here because both loops are constant motion, which AUDIT.md §2 says is
  `linear`.
- Reduced-motion opt-outs are collected in the single `@media (prefers-reduced-motion:
  reduce)` block at the bottom of `frontend/src/app/globals.css` — extend it, do not add
  a second block.
- Flat illustration style with the limited palette (night/paper/brand-500/sun/river) is
  the brand language — see `Patch` and `CorridorMap` in `frontend/src/components/ui.tsx`.

## Steps

1. Create `frontend/src/components/GlobeOrbit.tsx` with exactly the code given above.
2. Add the three keyframes and three animation utilities to `frontend/tailwind.config.ts`.
3. Extend the reduced-motion block in `frontend/src/app/globals.css`.
4. Edit `frontend/src/app/page.tsx`: remove the `ChequeCalculator` and `ChevronDown`
   imports, add the `GlobeOrbit` import, and swap the widget block for CTAs + globe.

## Boundaries

- Do NOT delete or edit `frontend/src/components/ChequeCalculator.tsx` — it becomes
  unused but stays on disk (product may reuse it on a pricing page later). TypeScript
  does not flag unused files.
- Do NOT wrap `GlobeOrbit` (or any ancestor of it) in `animate-rise` or any opacity
  animation. **Opacity < 1 forces `transform-style: preserve-3d` to flatten**, which
  would make all coins pop in front of the globe during the entrance and snap back
  after it. This is the #1 trap in this plan.
- Do NOT add perspective to the scene. The orthographic (perspective-less) projection
  gives the flat poster look that matches the brand; a perspective value would make it
  look pseudo-3D.
- Do NOT touch any other section of `page.tsx`, `ui.tsx`, or the `/app` pages.
- Do NOT add dependencies (no framer-motion, no three.js).
- If the code at `page.tsx:212-221` does not match the excerpt above (drift since commit
  964f599), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm --filter @cheque/web build` completes with no type errors, and
  `pnpm --filter @cheque/web dev` serves `/` with the globe visible below the hero CTAs.
- **Feel check** (in the browser at http://localhost:3100):
  - Coins pass **behind** the globe at the top of the orbit and **in front** at the
    bottom, and a coin is fully hidden for a stretch of each lap — not just dimmed.
  - Every coin stays upright and face-on through the entire lap; none tilts or wobbles.
    If a coin appears to rotate as it travels, the counter-spin's negative
    `animationDelay` is wrong or missing.
  - Watch one full 14s lap and one 28s globe loop: the map strip must wrap with no
    visible seam or jump (the two `MapHalf` copies must be identical).
  - In DevTools → Animations panel, set playback to 10%: the coin that is crossing the
    globe's silhouette should disappear *behind the disc's edge*, not fade.
  - Toggle `prefers-reduced-motion` in the Rendering panel: all loops stop; the scene
    renders as a static globe with coins parked around the ring, upright.
  - Check every coin glyph renders (₵ ₦ $ € £ ¥ ₹) — no tofu/missing-glyph boxes. If
    Inter is missing one, that is acceptable only if the system fallback renders it;
    report any tofu.
  - Resize to 360px width: the scene scales to ~308px and nothing overflows horizontally.
- **Done when**: build passes, the hero shows headline → CTAs → spinning globe with
  orbiting currency coins, occlusion works, reduced motion renders statically.
