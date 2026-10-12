'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps a page current without a reload. It listens to the server's update
 * stream for one topic (app/api/live/[topic]) and, when the trustees change
 * something (publish an event, add a photograph, a new registration), asks
 * Next.js for the fresh page content, which is swapped in place: the scroll
 * position and anything being typed stay as they are.
 *
 * Renders nothing. If the stream cannot be opened the page simply behaves like
 * an ordinary page; the browser retries the connection by itself.
 */
export default function LiveRefresh({ topic = 'events' }) {
  const router = useRouter();
  const seen = useRef(null);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    let source;
    let timer;

    const open = () => {
      source = new EventSource(`/api/live/${topic}`);
      source.addEventListener('version', (event) => {
        if (seen.current !== null && seen.current !== event.data) {
          // A short pause lets several quick changes (twenty photos) arrive as one refresh.
          window.clearTimeout(timer);
          timer = window.setTimeout(() => router.refresh(), 600);
        }
        seen.current = event.data;
      });
    };
    const close = () => { if (source) { source.close(); source = null; } };
    // No point holding a connection for a tab nobody is looking at.
    const onVisibility = () => { if (document.hidden) close(); else if (!source) open(); };

    open();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(timer);
      close();
    };
  }, [topic, router]);

  return null;
}
