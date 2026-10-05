'use client';

import { useEffect, useState } from 'react';

/**
 * A phrase that types itself, pauses, deletes itself and moves on to the next
 * one, in a loop: "We work for education | healthcare | ...".
 *
 *  - Server render, no-JS and reduced-motion show the first phrase as plain text.
 *  - Screen readers get the whole list once (visually hidden); the moving copy
 *    is aria-hidden, so nothing is announced over and over.
 *  - The box is as wide as the longest phrase (an invisible copy reserves the
 *    space), so the line never reflows while it types.
 *  - It pauses while the tab is in the background.
 */
export default function TypeRotate({ phrases, className = '', typeMs = 55, eraseMs = 28, holdMs = 1700 }) {
  const [state, setState] = useState(null); // null = static

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || phrases.length < 2) return undefined;

    let index = 0;
    let length = phrases[0].length;
    let erasing = true;
    let timer;

    const tick = () => {
      if (document.hidden) {
        timer = window.setTimeout(tick, 600);
        return;
      }
      const phrase = phrases[index];
      if (erasing) {
        length -= 1;
        if (length <= 0) {
          length = 0;
          erasing = false;
          index = (index + 1) % phrases.length;
        }
        setState({ index, length });
        timer = window.setTimeout(tick, length === 0 ? 260 : eraseMs);
      } else {
        length += 1;
        setState({ index, length });
        if (length >= phrase.length) {
          erasing = true;
          timer = window.setTimeout(tick, holdMs);
        } else {
          timer = window.setTimeout(tick, typeMs);
        }
      }
    };
    timer = window.setTimeout(tick, holdMs + 1400);

    return () => {
      window.clearTimeout(timer);
      setState(null);
    };
  }, [phrases, typeMs, eraseMs, holdMs]);

  const longest = phrases.reduce((a, b) => (b.length > a.length ? b : a), '');
  const shown = state ? phrases[state.index].slice(0, state.length) : phrases[0];

  return (
    <span className={`type-rotate ${className}`}>
      <span className="sr-only">{phrases.join(', ')}</span>
      <span aria-hidden="true" className="type-rotate-box">
        <span className="type-rotate-ghost">{longest}</span>
        <span className="type-rotate-live">
          {shown}
          <span className="tw-caret" />
        </span>
      </span>
    </span>
  );
}
