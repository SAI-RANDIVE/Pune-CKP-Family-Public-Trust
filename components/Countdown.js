'use client';

import { useEffect, useState } from 'react';
import { describeTimeLeft } from '../lib/timeLeft';

/**
 * A running timer to a closing time: "2 days 4 hrs left", then minutes and
 * seconds in the last hour, then the closed label. The server renders the
 * first value (`initial`) so it is readable without JavaScript; the browser
 * then keeps it ticking. If the time runs out while the page is open, the page
 * reloads once so that a closed poll stops offering its buttons.
 */
export default function Countdown({ until, initial, closedLabel = 'Closed', className = '' }) {
  const [text, setText] = useState(initial);

  useEffect(() => {
    const end = new Date(until).getTime();
    // Only a page that was open when the time ran out reloads; one that loads after it never does.
    const wasOpen = end > Date.now();
    let reloaded = false;
    const tick = () => {
      const next = describeTimeLeft(end - Date.now());
      setText(next || closedLabel);
      if (!next && wasOpen && !reloaded) {
        reloaded = true;
        window.setTimeout(() => window.location.reload(), 1500);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [until, closedLabel]);

  return <span className={className}>{text}</span>;
}
