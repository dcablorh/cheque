'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/** Renders children at a fixed design width and scales the whole thing to fit its container. */
export function ScaleToFit({ width, children }: { width: number; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const scale = Math.min(1.25, outer.current.clientWidth / width);
      setFit({ scale, height: inner.current.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={outer} className="w-full" style={{ height: fit?.height, visibility: fit ? 'visible' : 'hidden' }}>
      <div ref={inner} style={{ width, transform: `scale(${fit?.scale ?? 1})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}
