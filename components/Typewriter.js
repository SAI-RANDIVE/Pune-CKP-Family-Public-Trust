'use client';

import { useEffect, useState } from 'react';

/**
 * Typewriter headline.
 *
 * `segments` is a list of { text, className } pieces that together make the
 * sentence (so one phrase can be coloured).
 *
 * How it stays honest:
 *  - Server render, no-JS and reduced-motion all output the plain sentence,
 *    once, as ordinary text. Nothing is hidden and nothing is duplicated.
 *  - Only while it is actually typing does it switch to two copies: the whole
 *    sentence for screen readers (visually hidden) and an aria-hidden animated
 *    copy for sighted users.
 *  - The not-yet-typed part of the animated copy is still laid out (with
 *    visibility: hidden), so lines wrap exactly as in the final text and the
 *    heading never changes size: no layout shift.
 *  - It types once and stops. No endless loop on low-end phones.
 */
export default function Typewriter({ segments, speed = 34, startDelay = 350 }) {
  const total = segments.reduce((sum, s) => sum + s.text.length, 0);
  const [count, setCount] = useState(null); // null = static (not animating)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return undefined;
    // On a slow phone the visitor may already have read the headline by the
    // time scripts run: do not wipe it and retype it in front of them.
    if (typeof performance !== 'undefined' && performance.now() > 3500) return undefined;

    let n = 0;
    let timer;
    setCount(0);

    const step = () => {
      n += 1;
      if (n >= total) {
        setCount(null);
        return;
      }
      setCount(n);
      timer = window.setTimeout(step, speed);
    };
    timer = window.setTimeout(step, startDelay);

    return () => {
      window.clearTimeout(timer);
      setCount(null);
    };
  }, [total, speed, startDelay]);

  if (count === null) {
    return (
      <>
        {segments.map((s, i) => (
          <span key={i} className={s.className}>{s.text}</span>
        ))}
      </>
    );
  }

  let remaining = count;
  let caretPlaced = false;

  return (
    <>
      <span className="sr-only">{segments.map((s) => s.text).join('')}</span>
      <span aria-hidden="true">
        {segments.map((s, i) => {
          const shown = Math.max(0, Math.min(s.text.length, remaining));
          remaining -= s.text.length;
          const needsCaret = !caretPlaced && shown < s.text.length;
          if (needsCaret) caretPlaced = true;
          return (
            <span key={i} className={s.className}>
              {s.text.slice(0, shown)}
              {needsCaret && <span className="tw-caret" />}
              <span style={{ visibility: 'hidden' }}>{s.text.slice(shown)}</span>
            </span>
          );
        })}
      </span>
    </>
  );
}
