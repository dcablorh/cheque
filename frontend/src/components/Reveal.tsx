'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Scroll reveal: children fade and rise in when the block enters the viewport.
 * Pairs with the `.reveal` classes in globals.css. Renders a plain div so it can
 * wrap sections, cards or list rows; `delay` staggers siblings (ms).
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  /** Stagger delay in ms. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={`reveal ${shown ? 'in' : ''} ${className}`}
      style={{ ['--reveal-delay' as string]: `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
