'use client';

import { useEffect, useRef } from 'react';

/**
 * Scroll-triggered reveals.
 *
 * Safety rules these components follow, because the site is content-first:
 *  - Children are always server-rendered, so the text is in the raw HTML for
 *    crawlers and answer engines whether or not this ever animates.
 *  - The hidden state is applied *by JS only* (a data attribute). If JS never
 *    runs, the CSS selector never matches and content stays visible.
 *  - Anything already on screen when the page hydrates is left alone, so there
 *    is no visible -> hidden -> visible flicker above the fold.
 *  - `prefers-reduced-motion` short-circuits the whole thing.
 *  - If IntersectionObserver never reports at all, everything is revealed.
 *  - Only opacity and transform change, so nothing shifts layout.
 */
function useReveal(ref, attribute, delay) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || typeof IntersectionObserver === 'undefined') return undefined;

    // Already visible at hydration: do not hide what the visitor is reading.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) return undefined;

    node.setAttribute(attribute, 'pending');
    if (delay) node.style.transitionDelay = `${delay}ms`;

    let heard = false;
    let cleanup;

    const show = () => {
      node.setAttribute(attribute, 'in');
      // Hand the element back untouched once the transition is over, so its own
      // hover/focus transitions are not slowed or delayed by ours.
      cleanup = window.setTimeout(() => {
        node.removeAttribute(attribute);
        node.style.transitionDelay = '';
      }, 1500 + delay);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        heard = true;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          show();
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    observer.observe(node);

    const failsafe = window.setTimeout(() => { if (!heard) show(); }, 2500);

    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
      window.clearTimeout(cleanup);
      node.removeAttribute(attribute);
      node.style.transitionDelay = '';
    };
  }, [ref, attribute, delay]);
}

/**
 * Reveal one block. `variant`: 'up' (default), 'pop' (scale-in), 'left',
 * 'right' or 'fade'.
 */
export default function Reveal({ children, as: Tag = 'div', delay = 0, variant = 'up', className = '', ...rest }) {
  const ref = useRef(null);
  useReveal(ref, 'data-reveal', delay);

  return (
    <Tag ref={ref} className={className} data-variant={variant} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Reveal the direct children of a grid one after another (pop-in, 70ms apart)
 * using a single observer for the whole grid. Cheap enough for long lists.
 */
export function Stagger({ children, as: Tag = 'div', className = '', ...rest }) {
  const ref = useRef(null);
  useReveal(ref, 'data-stagger', 0);

  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
