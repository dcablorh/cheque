/**
 * Flags drawn as inline SVG.
 *
 * Windows has no glyphs for regional-indicator flag emoji, so "🇬🇭" renders as the
 * letters "GH" (and some Linux/Android setups show empty boxes). These are hand-built
 * vector flags on a 60×40 grid, so they look identical on every OS and at any size,
 * with no network request.
 */
import type { ReactElement } from 'react';

/** Points string for an n-pointed star. */
function star(cx: number, cy: number, outer: number, inner: number, points = 5, rotation = -90) {
  const step = Math.PI / points;
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (rotation * Math.PI) / 180 + i * step;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** 12 gold stars in a ring, for the EU flag. */
function euStars() {
  const out: { cx: number; cy: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    out.push({ cx: 30 + Math.cos(a) * 9.2, cy: 20 + Math.sin(a) * 9.2 });
  }
  return out;
}

const MAPLE_LEAF =
  'M10 0 L11.8 4.4 L15.6 2.8 L14.7 7 L19.4 6.2 L15.9 9.2 L19.4 12.2 L14 11.8 L14.9 15.9 ' +
  'L10.6 13.6 L10.6 20 L9.4 20 L9.4 13.6 L5.1 15.9 L6 11.8 L0.6 12.2 L4.1 9.2 L0.6 6.2 ' +
  'L5.3 7 L4.4 2.8 L8.2 4.4 Z';

const FLAGS: Record<string, ReactElement> = {
  GH: (
    <>
      <rect width="60" height="40" fill="#006B3F" />
      <rect width="60" height="13.34" fill="#CE1126" />
      <rect y="13.34" width="60" height="13.33" fill="#FCD116" />
      <polygon points={star(30, 20, 5.6, 2.3)} fill="#141414" />
    </>
  ),
  NG: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <rect width="20" height="40" fill="#008751" />
      <rect x="40" width="20" height="40" fill="#008751" />
    </>
  ),
  US: (
    <>
      <rect width="60" height="40" fill="#fff" />
      {Array.from({ length: 7 }).map((_, i) => (
        <rect key={`s${i}`} y={i * 6.1538} width="60" height="3.0769" fill="#B22234" />
      ))}
      <rect width="26" height="21.54" fill="#3C3B6E" />
      {Array.from({ length: 4 }).map((_, row) =>
        Array.from({ length: 5 }).map((__, col) => (
          <circle
            key={`d${row}-${col}`}
            cx={2.9 + col * 5.1 + (row % 2 ? 2.55 : 0)}
            cy={2.9 + row * 5.2}
            r="1.15"
            fill="#fff"
          />
        )),
      )}
    </>
  ),
  GB: (
    <>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" strokeWidth="4" />
      <path d="M30 0 V40 M0 20 H60" stroke="#fff" strokeWidth="13" />
      <path d="M30 0 V40 M0 20 H60" stroke="#C8102E" strokeWidth="7" />
    </>
  ),
  KE: (
    <>
      <rect width="60" height="40" fill="#006600" />
      <rect width="60" height="12.4" fill="#141414" />
      <rect y="12.4" width="60" height="1.6" fill="#fff" />
      <rect y="14" width="60" height="12" fill="#BB0000" />
      <rect y="26" width="60" height="1.6" fill="#fff" />
      <ellipse cx="30" cy="20" rx="6.6" ry="9.4" fill="#BB0000" stroke="#fff" strokeWidth="1.1" />
      <ellipse cx="30" cy="20" rx="1.5" ry="7" fill="#141414" opacity=".85" />
    </>
  ),
  PH: (
    <>
      <rect width="60" height="20" fill="#0038A8" />
      <rect y="20" width="60" height="20" fill="#CE1126" />
      <path d="M0 0 L26 20 L0 40 Z" fill="#fff" />
      <circle cx="8.4" cy="20" r="3.4" fill="#FCD116" />
      <circle cx="18" cy="9" r="1.3" fill="#FCD116" />
      <circle cx="18" cy="31" r="1.3" fill="#FCD116" />
      <circle cx="13" cy="20" r="1.3" fill="#FCD116" />
    </>
  ),
  ZA: (
    <>
      <rect width="60" height="20" fill="#DE3831" />
      <rect y="20" width="60" height="20" fill="#002395" />
      <path d="M0 3 L27 20 L0 37" stroke="#fff" strokeWidth="13" fill="none" />
      <path d="M0 3 L27 20 L0 37" stroke="#FFB612" strokeWidth="9.5" fill="none" />
      <path d="M0 3 L27 20 L0 37" stroke="#007A4D" strokeWidth="6.5" fill="none" />
      <path d="M0 0 L21 20 L0 40 Z" fill="#141414" stroke="#FFB612" strokeWidth="1.4" />
    </>
  ),
  IN: (
    <>
      <rect width="60" height="13.34" fill="#FF9933" />
      <rect y="13.34" width="60" height="13.33" fill="#fff" />
      <rect y="26.67" width="60" height="13.33" fill="#138808" />
      <circle cx="30" cy="20" r="4.6" fill="none" stroke="#000080" strokeWidth="1" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <line
            key={`sp${i}`}
            x1={30 + Math.cos(a) * 0.9}
            y1={20 + Math.sin(a) * 0.9}
            x2={30 + Math.cos(a) * 4.2}
            y2={20 + Math.sin(a) * 4.2}
            stroke="#000080"
            strokeWidth=".5"
          />
        );
      })}
    </>
  ),
  BR: (
    <>
      <rect width="60" height="40" fill="#009C3B" />
      <path d="M30 4.5 L55.5 20 L30 35.5 L4.5 20 Z" fill="#FFDF00" />
      <circle cx="30" cy="20" r="8.2" fill="#002776" />
      <path d="M22.2 17.4 C26 21.6 34.6 22.6 37.6 18.2" stroke="#fff" strokeWidth="2.4" fill="none" />
    </>
  ),
  EU: (
    <>
      <rect width="60" height="40" fill="#003399" />
      {euStars().map((s, i) => (
        <polygon key={`eu${i}`} points={star(s.cx, s.cy, 2.1, 0.85)} fill="#FFCC00" />
      ))}
    </>
  ),
  CA: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <rect width="15" height="40" fill="#D80621" />
      <rect x="45" width="15" height="40" fill="#D80621" />
      <path d={MAPLE_LEAF} fill="#D80621" transform="translate(20 9.4) scale(1 0.98)" />
    </>
  ),
};

export type FlagCode = keyof typeof FLAGS;

/**
 * A country flag. Size it with height/width classes (3:2 looks right: `h-4 w-6`).
 * Falls back to a neutral chip showing the code if we have no artwork yet.
 */
export function Flag({
  code,
  className = '',
  title,
}: {
  code: string;
  className?: string;
  title?: string;
}) {
  const key = code.toUpperCase();
  const art = FLAGS[key];
  const label = title ?? key;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-block shrink-0 select-none overflow-hidden rounded-[2px] leading-none ring-1 ring-inset ring-black/20 ${className}`}
    >
      {art ? (
        <svg viewBox="0 0 60 40" preserveAspectRatio="none" className="block h-full w-full" aria-hidden focusable="false">
          {art}
        </svg>
      ) : (
        <span className="grid h-full w-full place-items-center bg-night/10 text-[8px] font-semibold uppercase text-ink-soft">
          {key}
        </span>
      )}
    </span>
  );
}
