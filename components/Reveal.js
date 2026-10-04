'use client';

import { useEffect, useRef } from 'react';

/**
 * Scroll-triggered reveal.
 *
 * Safety rules this component follows, because the site is content-first:
 *  - Children are always server-rendered, so the text is in the raw HTML for
 *    crawlers and answer engines whether or not this ever animates.
 *  - The hidden state is applied *by JS only* (`data-reveal="pending"`). If JS
 *    never runs, the CSS selector never matches and content stays visible.
 *  - `prefers-reduced-motion` short-circuits the whole thing.
 *  - A failsafe timer reveals everything after 1.2s even if IntersectionObserver
 *    never fires, so content can't get stranded invisible.
 */
export default function Reveal({ children, as: Tag = 'div', delay = 0, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || typeof IntersectionObserver === 'undefined') return undefined;

    node.dataset.reveal = 'pending';
    if (delay) node.style.transitionDelay = `${delay}ms`;

    const show = () => { node.dataset.reveal = 'in'; };

    // Already on screen at mount (above the fold): reveal on the next frame so
    // the transition still plays rather than snapping.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          show();
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    observer.observe(node);

    const failsafe = window.setTimeout(show, 1200);

    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [delay]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
