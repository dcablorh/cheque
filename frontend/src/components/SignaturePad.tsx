'use client';

import { useEffect, useRef, useState } from 'react';

/** Draw-your-signature canvas. Emits a small PNG data URL, or null when cleared. */
export function SignaturePad({ onChange, hint = 'Sign here', className = 'h-[52px]' }: { onChange: (png: string | null) => void; hint?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    // Match the canvas bitmap to its on-screen size so strokes are never stretched.
    c.width = Math.max(240, c.clientWidth * 2);
    c.height = Math.max(120, c.clientHeight * 2);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#122315';
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = ref.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = ref.current!.getContext('2d')!;
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    onChange(ref.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={ref}
        aria-label="Signature pad: draw your signature"
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      {empty && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] italic text-night/40">{hint}</span>
      )}
      {!empty && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-2 rounded bg-night px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-paper"
        >
          Clear
        </button>
      )}
    </div>
  );
}
