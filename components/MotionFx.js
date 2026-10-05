'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The site-wide motion layer, mounted once in the public layout.
 *
 *  - a reading-progress bar under the header and a back-to-top button whose
 *    ring fills as the page is read;
 *  - cards (.card-hover) tilt towards the pointer and carry a soft spotlight;
 *  - large buttons (.btn-lg) lean towards the pointer ("magnetic");
 *  - anything marked data-parallax="0.12" drifts at its own speed on scroll;
 *  - section headings (.h-section) draw a highlight when they scroll in.
 *
 * Everything here is decoration added on top of server-rendered content. It
 * only ever writes CSS custom properties and data attributes (never content),
 * uses event delegation so it costs the same on a page with 5 cards or 500,
 * and does nothing at all under prefers-reduced-motion. Pointer effects are
 * limited to devices with a real pointer, so phones are not asked to do work
 * they cannot show.
 */
export default function MotionFx() {
  const bar = useRef(null);
  const top = useRef(null);
  const pathname = usePathname();

  // Scroll: progress bar, back-to-top ring, parallax.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let layers = [];

    const collect = () => { layers = reduced ? [] : [...document.querySelectorAll('[data-parallax]')]; };

    const paint = () => {
      frame = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, y / max) : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${progress})`;
      if (top.current) {
        top.current.dataset.show = y > 700 ? 'true' : 'false';
        top.current.style.setProperty('--progress', String(progress));
      }
      for (const el of layers) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > window.innerHeight + 200) continue;
        const centre = rect.top + rect.height / 2 - window.innerHeight / 2;
        el.style.translate = `0 ${(-centre * Number(el.dataset.parallax || 0.1)).toFixed(1)}px`;
      }
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(paint); };

    collect();
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.cancelAnimationFrame(frame);
      layers.forEach((el) => { el.style.translate = ''; });
    };
  }, [pathname]);

  // Headings light up once when they scroll into view.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.lit = 'true';
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.6 });
    const headings = [...document.querySelectorAll('main .h-section')];
    headings.forEach((h) => observer.observe(h));
    return () => {
      observer.disconnect();
      headings.forEach((h) => { delete h.dataset.lit; });
    };
  }, [pathname]);

  // Pointer: tilt + spotlight on cards, magnetic large buttons.
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return undefined;

    let card = null;
    let magnet = null;
    let frame = 0;
    let last = null;

    const release = () => {
      if (card) {
        card.removeAttribute('data-tilt');
        ['--mx', '--my', '--rx', '--ry'].forEach((p) => card.style.removeProperty(p));
        card = null;
      }
      if (magnet) {
        magnet.style.translate = '';
        magnet = null;
      }
    };

    const paint = () => {
      frame = 0;
      if (!last) return;
      const target = last.target instanceof Element ? last.target : null;
      const nextCard = target ? target.closest('.card-hover') : null;
      const nextMagnet = target ? target.closest('.btn-lg') : null;
      if (nextCard !== card || nextMagnet !== magnet) release();

      if (nextCard) {
        card = nextCard;
        const r = card.getBoundingClientRect();
        const px = (last.clientX - r.left) / r.width;
        const py = (last.clientY - r.top) / r.height;
        // Large cards tilt less so the far edge never swings wildly.
        const strength = Math.max(2, Math.min(7, 1800 / Math.max(r.width, r.height)));
        card.setAttribute('data-tilt', '');
        card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
        card.style.setProperty('--rx', `${((0.5 - py) * strength).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${((px - 0.5) * strength).toFixed(2)}deg`);
      }
      if (nextMagnet) {
        magnet = nextMagnet;
        const r = magnet.getBoundingClientRect();
        const dx = last.clientX - (r.left + r.width / 2);
        const dy = last.clientY - (r.top + r.height / 2);
        magnet.style.translate = `${(dx * 0.14).toFixed(1)}px ${(dy * 0.22).toFixed(1)}px`;
      }
    };

    const onMove = (event) => {
      last = event;
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const onLeave = () => { last = null; release(); };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.cancelAnimationFrame(frame);
      release();
    };
  }, []);

  const toTop = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <>
      <div className="scroll-progress" aria-hidden="true"><span ref={bar} /></div>
      <button ref={top} type="button" className="to-top" data-show="false" onClick={toTop} aria-label="Back to top">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle className="to-top-track" cx="24" cy="24" r="21" />
          <circle className="to-top-ring" cx="24" cy="24" r="21" pathLength="1" />
          <path d="M24 31V18m0 0-6 6m6-6 6 6" />
        </svg>
      </button>
    </>
  );
}
