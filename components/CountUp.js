'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts up to `value` when scrolled into view.
 *
 * The finished number is rendered on the server as the initial state, so the
 * real figure is always in the HTML — the animation only ever counts *up to*
 * a value the crawler has already seen. Reduced-motion users get the final
 * number immediately with no tween.
 */
export default function CountUp({ value, duration = 1400, prefix = '', suffix = '', className = '' }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(value);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || typeof IntersectionObserver === 'undefined') return undefined;

    let frame;
    let observer;
    let done = false;

    const run = () => {
      if (done) return;
      done = true;
      setAnimating(true);
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        // easeOutCubic — fast start, gentle settle
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(Math.round(value * eased));
        if (t < 1) frame = requestAnimationFrame(tick);
        else setDisplay(value);
      };
      frame = requestAnimationFrame(tick);
    };

    observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        run();
        observer.unobserve(e.target);
      }),
      { threshold: 0.3 }
    );
    observer.observe(node);
    setDisplay(0);

    // Failsafe: never leave a zero on screen if the observer misbehaves.
    const failsafe = window.setTimeout(() => { if (!done) { done = true; setDisplay(value); } }, 2000);

    return () => {
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(failsafe);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className} aria-label={`${prefix}${value.toLocaleString('en-IN')}${suffix}`}>
      <span aria-hidden={animating ? 'true' : undefined}>
        {prefix}{display.toLocaleString('en-IN')}{suffix}
      </span>
    </span>
  );
}
