import { ScaleToFit } from './ScaleToFit';
import { Loader2 } from 'lucide-react';
import { STATE_LABEL } from '@/lib/api';
import { amountInWords } from '@/lib/words';

/** The sencheq wordmark (artwork in public/brand). Dark ink on light, light ink on dark. */
export function Logo({ className = '', tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === 'light' ? '/brand/sencheq-logo-light.png' : '/brand/sencheq-logo.png'}
      alt="sencheq"
      className={`h-8 w-auto select-none ${className}`}
      draggable={false}
    />
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-4 w-4 animate-spin ${className}`} aria-hidden />;
}

const TONES = {
  green: 'bg-brand-100 text-night ring-brand-500/50',
  amber: 'bg-sun/60 text-night ring-sun',
  gray: 'bg-night/5 text-ink-soft ring-sage/40',
  red: 'bg-cedi/10 text-cedi ring-cedi/30',
  blue: 'bg-river/30 text-night ring-river',
};

export function StatusPill({ state }: { state: string }) {
  const s = STATE_LABEL[state] ?? { label: state, tone: 'gray' as const };
  return (
    <span
      className={`inline-flex items-center rounded-[20px] px-3 py-1 text-[11px] font-medium uppercase tracking-[.16em] ring-1 ring-inset ${TONES[s.tone]}`}
    >
      {s.label}
    </span>
  );
}

export function ErrorNote({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-[10px] border border-cedi/40 bg-cedi/5 px-4 py-3 text-sm text-cedi">
      {children}
    </p>
  );
}

/** Kept for call-site compatibility: a flat meadow rule. */
export function Tricolor({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`h-1 bg-brand-500 ${className}`} />;
}

/** Circular enamel-pin badge: deep navy disc, cream ring, flat illustration. No shadow. */
export function Patch({
  kind,
  label,
  rotate = 0,
  size = 140,
  className = '',
}: {
  kind: 'star' | 'chat' | 'globe' | 'coin';
  label: string;
  rotate?: number;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`animate-bob ${className}`}
      style={{ ['--r' as string]: `${rotate}deg`, width: size, height: size } as React.CSSProperties}
    >
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={label}>
        <circle cx="70" cy="70" r="67" fill="#0a071b" stroke="#f3ede4" strokeWidth="2.5" />
        <circle cx="70" cy="70" r="56" fill="none" stroke="#f3ede4" strokeWidth=".8" strokeDasharray="2 4" opacity=".6" />
        {kind === 'star' && (
          <>
            {/* Stellar: a star inside its orbit */}
            <ellipse cx="70" cy="64" rx="38" ry="14" fill="none" stroke="#f3ede4" strokeWidth="3" transform="rotate(-20 70 64)" />
            <path d="M70 34 L77 58 L102 64 L77 70 L70 94 L63 70 L38 64 L63 58 Z" fill="#ffed52" />
          </>
        )}
        {kind === 'chat' && (
          <>
            {/* a message bubble: if you can message them, you can pay them */}
            <path d="M34 40 H106 a8 8 0 0 1 8 8 V78 a8 8 0 0 1 -8 8 H68 L50 100 V86 H34 a8 8 0 0 1 -8 -8 V48 a8 8 0 0 1 8 -8 Z" fill="#55dd4a" />
            <circle cx="52" cy="63" r="5" fill="#0a071b" />
            <circle cx="70" cy="63" r="5" fill="#0a071b" />
            <circle cx="88" cy="63" r="5" fill="#0a071b" />
          </>
        )}
        {kind === 'globe' && (
          <>
            <circle cx="70" cy="64" r="30" fill="none" stroke="#73d3eb" strokeWidth="4" />
            <ellipse cx="70" cy="64" rx="13" ry="30" fill="none" stroke="#73d3eb" strokeWidth="3" />
            <path d="M40 64 H100 M45 50 H95 M45 78 H95" stroke="#73d3eb" strokeWidth="3" />
            <path d="M30 92 Q70 46 112 84" fill="none" stroke="#f3ede4" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 7" />
            <circle cx="112" cy="84" r="5" fill="#55dd4a" />
          </>
        )}
        {kind === 'coin' && (
          <>
            {/* local currencies cashing out: cedi, naira, dollar */}
            <circle cx="46" cy="72" r="20" fill="#55dd4a" />
            <text x="46" y="82" textAnchor="middle" fontSize="28" fontWeight="700" fill="#0a071b" fontFamily="var(--font-display), Impact, sans-serif">₵</text>
            <circle cx="94" cy="72" r="20" fill="#73d3eb" />
            <text x="94" y="82" textAnchor="middle" fontSize="28" fontWeight="700" fill="#0a071b" fontFamily="var(--font-display), Impact, sans-serif">$</text>
            <circle cx="70" cy="52" r="22" fill="#ffed52" />
            <text x="70" y="63" textAnchor="middle" fontSize="30" fontWeight="700" fill="#0a071b" fontFamily="var(--font-display), Impact, sans-serif">₦</text>
          </>
        )}
        <defs>
          <path id={`arc-${kind}`} d="M 18 70 A 52 52 0 0 0 122 70" />
        </defs>
        <text fontSize="10" letterSpacing="2.4" fill="#f3ede4" fontFamily="var(--font-display), Impact, sans-serif" textAnchor="middle">
          <textPath href={`#arc-${kind}`} startOffset="50%">{label.toUpperCase()}</textPath>
        </text>
      </svg>
    </div>
  );
}

/** Pins on the corridor map: US, Ghana, Nigeria. */
const PINS = [
  { x: 520, y: 360 },
  { x: 860, y: 345 },
  { x: 960, y: 335 },
];

const MAP_DOTS = "M600 288h2 M616 288h2 M632 288h2 M648 288h2 M664 288h2 M680 288h2 M696 288h2 M712 288h2 M728 288h2 M744 288h2 M760 288h2 M776 288h2 M792 288h2 M808 288h2 M824 288h2 M840 288h2 M544 304h2 M560 304h2 M576 304h2 M592 304h2 M608 304h2 M624 304h2 M640 304h2 M656 304h2 M672 304h2 M688 304h2 M704 304h2 M720 304h2 M736 304h2 M752 304h2 M768 304h2 M784 304h2 M800 304h2 M816 304h2 M832 304h2 M848 304h2 M864 304h2 M880 304h2 M896 304h2 M488 320h2 M504 320h2 M520 320h2 M536 320h2 M552 320h2 M568 320h2 M584 320h2 M600 320h2 M616 320h2 M632 320h2 M648 320h2 M664 320h2 M680 320h2 M696 320h2 M712 320h2 M728 320h2 M744 320h2 M760 320h2 M776 320h2 M792 320h2 M808 320h2 M824 320h2 M840 320h2 M856 320h2 M872 320h2 M888 320h2 M904 320h2 M920 320h2 M936 320h2 M952 320h2 M464 336h2 M480 336h2 M496 336h2 M512 336h2 M528 336h2 M544 336h2 M560 336h2 M576 336h2 M592 336h2 M608 336h2 M624 336h2 M640 336h2 M656 336h2 M672 336h2 M688 336h2 M704 336h2 M720 336h2 M736 336h2 M752 336h2 M768 336h2 M784 336h2 M800 336h2 M816 336h2 M832 336h2 M848 336h2 M864 336h2 M880 336h2 M896 336h2 M912 336h2 M928 336h2 M944 336h2 M960 336h2 M976 336h2 M424 352h2 M440 352h2 M456 352h2 M472 352h2 M488 352h2 M504 352h2 M520 352h2 M536 352h2 M552 352h2 M568 352h2 M584 352h2 M600 352h2 M616 352h2 M632 352h2 M648 352h2 M664 352h2 M680 352h2 M696 352h2 M712 352h2 M728 352h2 M744 352h2 M760 352h2 M776 352h2 M792 352h2 M808 352h2 M824 352h2 M840 352h2 M856 352h2 M872 352h2 M888 352h2 M904 352h2 M920 352h2 M936 352h2 M952 352h2 M968 352h2 M984 352h2 M1000 352h2 M1016 352h2 M400 368h2 M416 368h2 M432 368h2 M448 368h2 M464 368h2 M480 368h2 M496 368h2 M512 368h2 M528 368h2 M544 368h2 M560 368h2 M576 368h2 M592 368h2 M608 368h2 M624 368h2 M640 368h2 M656 368h2 M672 368h2 M688 368h2 M704 368h2 M720 368h2 M736 368h2 M752 368h2 M768 368h2 M784 368h2 M800 368h2 M816 368h2 M832 368h2 M848 368h2 M864 368h2 M880 368h2 M896 368h2 M912 368h2 M928 368h2 M944 368h2 M960 368h2 M976 368h2 M992 368h2 M1008 368h2 M1024 368h2 M1040 368h2 M376 384h2 M392 384h2 M408 384h2 M424 384h2 M440 384h2 M456 384h2 M472 384h2 M488 384h2 M504 384h2 M520 384h2 M536 384h2 M552 384h2 M568 384h2 M584 384h2 M600 384h2 M616 384h2 M632 384h2 M648 384h2 M664 384h2 M680 384h2 M696 384h2 M712 384h2 M728 384h2 M744 384h2 M760 384h2 M776 384h2 M792 384h2 M808 384h2 M824 384h2 M840 384h2 M856 384h2 M872 384h2 M888 384h2 M904 384h2 M920 384h2 M936 384h2 M952 384h2 M968 384h2 M984 384h2 M1000 384h2 M1016 384h2 M1032 384h2 M1048 384h2 M1064 384h2 M352 400h2 M368 400h2 M384 400h2 M400 400h2 M416 400h2 M432 400h2 M448 400h2 M464 400h2 M480 400h2 M496 400h2 M512 400h2 M528 400h2 M544 400h2 M560 400h2 M576 400h2 M592 400h2 M608 400h2 M624 400h2 M640 400h2 M656 400h2 M672 400h2 M688 400h2 M704 400h2 M720 400h2 M736 400h2 M752 400h2 M768 400h2 M784 400h2 M800 400h2 M816 400h2 M832 400h2 M848 400h2 M864 400h2 M880 400h2 M896 400h2 M912 400h2 M928 400h2 M944 400h2 M960 400h2 M976 400h2 M992 400h2 M1008 400h2 M1024 400h2 M1040 400h2 M1056 400h2 M1072 400h2 M1088 400h2 M328 416h2 M344 416h2 M360 416h2 M376 416h2 M392 416h2 M408 416h2 M424 416h2 M440 416h2 M456 416h2 M472 416h2 M488 416h2 M504 416h2 M520 416h2 M536 416h2 M552 416h2 M568 416h2 M584 416h2 M600 416h2 M616 416h2 M632 416h2 M648 416h2 M664 416h2 M680 416h2 M696 416h2 M712 416h2 M728 416h2 M744 416h2 M760 416h2 M776 416h2 M792 416h2 M808 416h2 M824 416h2 M840 416h2 M856 416h2 M872 416h2 M888 416h2 M904 416h2 M920 416h2 M936 416h2 M952 416h2 M968 416h2 M984 416h2 M1000 416h2 M1016 416h2 M1032 416h2 M1048 416h2 M1064 416h2 M1080 416h2 M1096 416h2 M1112 416h2";

/**
 * Flat poster map for cross-border payments: a dotted globe at night with routes arcing between
 * the US, Ghana and Nigeria and a coin riding each route. Limited palette, no gradients.
 */
export function CorridorMap({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" className={className}>
      <circle cx="80" cy="40" r="2" fill="#f3ede4" opacity=".7" /><circle cx="210" cy="110" r="2" fill="#f3ede4" opacity=".7" /><circle cx="330" cy="60" r="2" fill="#f3ede4" opacity=".7" /><circle cx="1180" cy="50" r="2" fill="#f3ede4" opacity=".7" /><circle cx="1300" cy="120" r="2" fill="#f3ede4" opacity=".7" /><circle cx="1390" cy="40" r="2" fill="#f3ede4" opacity=".7" /><circle cx="640" cy="30" r="2" fill="#f3ede4" opacity=".7" /><circle cx="860" cy="70" r="2" fill="#f3ede4" opacity=".7" /><circle cx="990" cy="25" r="2" fill="#f3ede4" opacity=".7" />
      <circle cx="720" cy="900" r="640" fill="#0a071b" stroke="#f3ede4" strokeWidth="3" />
      <path d={MAP_DOTS} stroke="#73d3eb" strokeWidth="3" strokeLinecap="round" opacity=".55" />
      <path d="M520 360 Q690 130 860 345" fill="none" stroke="#f3ede4" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
      <path d="M520 360 Q740 150 960 335" fill="none" stroke="#55dd4a" strokeWidth="3.5" strokeDasharray="2 9" strokeLinecap="round" />
      <path d="M860 345 Q910 300 960 335" fill="none" stroke="#73d3eb" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" />
      <circle cx="690" cy="241" r="11" fill="#ffed52" />
      <circle cx="740" cy="249" r="9" fill="#55dd4a" stroke="#f3ede4" strokeWidth="2" />
      {PINS.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="16" fill="#55dd4a" opacity=".25" />
          <circle cx={p.x} cy={p.y} r="8" fill="#55dd4a" stroke="#f3ede4" strokeWidth="2.5" />
        </g>
      ))}
      <rect x="0" y="404" width="1440" height="16" fill="#f3ede4" />
    </svg>
  );
}

/**
 * A cheque laid out like a bank cheque: security-tinted paper with a fine guilloche pattern,
 * issuer and cheque number top left/right, date, "Pay to the order of", the amount in a box,
 * the legal amount in words, memo, signature, and a MICR line along the bottom.
 */
export function ChequePaper(props: {
  /** Formatted amount for the box, e.g. "₦150,000.00". */
  amount: string;
  /** Raw major-unit amount, used to write the amount in words. */
  amountValue?: string | number;
  payee: string;
  from?: string | null;
  /** Drawn signature (PNG data URL); falls back to the sender's name in script type. */
  signature?: string | null;
  /** Replaces the signature area, e.g. with an editable signature pad. */
  signSlot?: React.ReactNode;
  note?: string | null;
  code: string;
  stamp?: string;
  currency?: string;
  /** Display date, e.g. "12 Nov 2026". Left blank when omitted. */
  date?: string;
  /** Smaller type for narrow containers (the sidebar preview). */
  compact?: boolean;
  footer?: React.ReactNode;
}) {
  const currency = props.currency ?? 'GHS';
  const words = props.amountValue !== undefined && Number(props.amountValue) > 0 ? amountInWords(props.amountValue, currency) : '';
  const micrCode = props.code.replace(/[^A-Z0-9]/gi, '');
  const micrAmount =
    props.amountValue !== undefined ? Math.round(Number(props.amountValue) * 100).toString().padStart(10, '0') : '0000000000';
  return (
    <ScaleToFit width={720}>
    <div className="relative overflow-hidden rounded-[10px] border border-night/40 bg-[#f4efe0] text-night shadow-cheque">
      {/* guilloche security pattern */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[.16]">
        <defs>
          <pattern id="guilloche" width="120" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 7 Q15 -2 30 7 T60 7 T90 7 T120 7" fill="none" stroke="#2b8a24" strokeWidth=".8" />
            <path d="M0 7 Q15 16 30 7 T60 7 T90 7 T120 7" fill="none" stroke="#0f3a1c" strokeWidth=".6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#guilloche)" />
      </svg>
      {/* inner security border */}
      <div aria-hidden className="pointer-events-none absolute inset-1.5 rounded-[6px] border border-night/20" />

      <div className="relative px-7 pb-3 pt-6">
        {/* issuer, number, date */}
        <div className="flex items-start justify-between gap-x-4">
          <div className="min-w-0">
            <Logo className="!text-[28px]" />
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[.2em] text-night/60">
              Cross-border cheque<span> · Settled on Stellar</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-xs font-semibold tracking-[.12em] text-night/80">No. {props.code}</p>
            <div className="mt-2 flex items-end justify-end gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[.2em] text-night/60">Date</span>
              <span className="min-w-[6.5rem] border-b border-night/70 pb-px text-center text-sm font-medium">
                {props.date ?? ' '}
              </span>
            </div>
          </div>
        </div>

        {/* payee + amount box */}
        <div className="mt-6 flex items-end gap-x-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase leading-tight tracking-[.2em] text-night/60">
              Pay to the
              <br />
              order of
            </p>
            <p className={`display mt-1 truncate border-b border-night/70 pb-1 text-[40px] !normal-case !leading-[1.05]`}>
              {props.payee}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[13px] font-bold">{currency}</span>
            <div className="rounded-[4px] border-2 border-night bg-white/70 px-3 py-1.5">
              <p className={`display text-[38px] !leading-none tabular-nums`}>{props.amount}</p>
            </div>
          </div>
        </div>

        {/* amount in words */}
        <div className="mt-3 flex items-end gap-3">
          <p className="min-w-0 flex-1 truncate border-b border-night/70 pb-1 text-sm italic">
            {words || ' '}
          </p>
        </div>

        {/* memo + signature */}
        <div className="mt-6 flex items-end justify-between gap-x-6">
          <div className="min-w-[7rem] flex-1">
            <div className="flex items-end gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[.2em] text-night/60">Memo</span>
              <span className="min-w-0 flex-1 truncate border-b border-night/70 pb-px text-sm">{props.note ?? ' '}</span>
            </div>
          </div>
          <div className="w-60 shrink-0">
            <div className="border-b border-night/70 pb-0.5">
              {props.signSlot ? (
                props.signSlot
              ) : props.signature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.signature} alt="Sender's signature" className="mx-auto h-[52px] object-contain" />
              ) : (
                <p
                  className="truncate text-center text-[26px] leading-[52px]"
                  style={{ fontFamily: '"Snell Roundhand", "Segoe Script", "Brush Script MT", cursive' }}
                >
                  {props.from ?? ' '}
                </p>
              )}
            </div>
            <p className="mt-1 text-center text-[10px] font-medium uppercase tracking-[.2em] text-night/60">
              Authorised signature
            </p>
          </div>
        </div>
      </div>

      {/* MICR line */}
      <div className="relative overflow-hidden whitespace-nowrap px-7 pb-3 pt-1 font-mono text-[14px] tracking-[.3em] text-night/80">
        ⑈ {micrCode} ⑈ &nbsp;⑆ {currency} ⑆ &nbsp;{micrAmount} ⑈
      </div>

      {props.footer && <div className="relative border-t border-night/15 bg-paper px-7 py-4">{props.footer}</div>}

      {props.stamp && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-[38%] top-[46%] -rotate-6 animate-stamp rounded-[4px] border-[3px] border-brand-700 px-4 py-1 text-brand-700 [mix-blend-mode:multiply]"
        >
          <span className="display text-3xl">{props.stamp}</span>
        </div>
      )}
    </div>
    </ScaleToFit>
  );
}
