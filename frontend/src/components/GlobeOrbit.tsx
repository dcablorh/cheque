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
      <div className="max-[520px]:scale-[.7] max-[520px]:-my-16">
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
                        <div
                          className={`grid h-full w-full place-items-center rounded-full text-[22px] font-black text-night ring-2 ring-paper/60 ${c.bg}`}
                        >
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
