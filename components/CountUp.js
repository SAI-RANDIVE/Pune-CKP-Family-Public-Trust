'use client';

import { useEffect, useRef, useState } from 'react';

function format(n, notation) {
  if (notation === 'lakh') return (n / 100000).toFixed(1);
  return Math.round(n).toLocaleString('en-IN');
}

/**
 * Counts up to `value` when scrolled into view.
 *
 * The finished number is rendered on the server as the initial state, so the
 * real figure is always in the HTML: the animation only ever counts *up to*
 * a value the crawler has already seen. Reduced-motion users get the final
 * number immediately with no tween. The box is reserved at the width of the
 * final figure (tabular digits), so counting never shifts the layout.
 *
 * `notation="lakh"` shows a rupee total in lakh with one decimal ("60.1");
 * the caller prints the word "lakh" next to it.
 */
export default function CountUp({ value, duration = 1400, prefix = '', suffix = '', className = '', notation = 'full' }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(value);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || typeof IntersectionObserver === 'undefined') return undefined;

    let frame;
    let done = false;

    const run = () => {
      if (done) return;
      done = true;
      setAnimating(true);
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        // easeOutCubic: fast start, gentle settle
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(value * eased);
        if (t < 1) frame = requestAnimationFrame(tick);
        else { setDisplay(value); setAnimating(false); }
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
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
    const failsafe = window.setTimeout(() => {
      if (document.visibilityState === 'visible' && !done && node.getBoundingClientRect().top < window.innerHeight) {
        done = true;
        setDisplay(value);
      }
    }, 2000);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(failsafe);
      setDisplay(value);
    };
  }, [value, duration]);

  const finalText = `${prefix}${format(value, notation)}${suffix}`;

  return (
    <span
      ref={ref}
      className={`inline-block tabular-nums ${className}`}
      style={{ minWidth: `${finalText.length}ch` }}
      aria-label={finalText}
      role="img"
    >
      <span aria-hidden={animating ? 'true' : undefined}>
        {prefix}{format(display, notation)}{suffix}
      </span>
    </span>
  );
}
