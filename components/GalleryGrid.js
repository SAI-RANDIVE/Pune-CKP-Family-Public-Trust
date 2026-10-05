'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Photo grid with an accessible lightbox.
 *
 * Grid: every tile is a real link to the full image, so without JavaScript a
 * tap simply opens the photo. Images are lazy-loaded by next/image and sit in
 * fixed-ratio frames (no layout shift).
 *
 * Lightbox: a modal dialog. Focus moves into it and is trapped there; Escape
 * or the close button closes it and returns focus to the tile that opened it.
 * Left/Right arrows, Home/End and the on-screen buttons move between photos;
 * on touch screens a horizontal swipe does the same. Page scroll is locked
 * while it is open. Captions are announced politely as the photo changes.
 *
 * `images` is [{ src, alt, caption }], plain data from a server component.
 */
export default function GalleryGrid({ images, label = 'Photographs', columns = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' }) {
  const [index, setIndex] = useState(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const openerRef = useRef(null);
  const touchRef = useRef(null);
  const open = index !== null;
  const total = images.length;

  const close = useCallback(() => {
    setIndex(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }, []);

  const step = useCallback((delta) => {
    setIndex((current) => (current === null ? current : (current + delta + total) % total));
  }, [total]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); return; }
      if (event.key === 'Home') { event.preventDefault(); setIndex(0); return; }
      if (event.key === 'End') { event.preventDefault(); setIndex(total - 1); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not([disabled]), a[href]') || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close, step, total]);

  function onTileClick(event, i) {
    // Let modified clicks (new tab, download) behave like the plain links they are.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    openerRef.current = event.currentTarget;
    setIndex(i);
  }

  function onTouchStart(event) {
    const touch = event.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    step(dx < 0 ? 1 : -1);
  }

  const current = open ? images[index] : null;

  return (
    <>
      <ul className={`grid gap-3 sm:gap-4 ${columns}`} aria-label={label}>
        {images.map((image, i) => (
          <li key={`${image.src}-${i}`}>
            <a
              href={image.src}
              onClick={(event) => onTileClick(event, i)}
              className="photo-frame group block aspect-square rounded-2xl border border-saffron-200/70 shadow-soft"
              aria-label={`View photo ${i + 1} of ${total}: ${image.alt}`}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 270px"
                className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
              {image.caption && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 p-3 text-left text-xs font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
                  {image.caption}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>

      {open && current && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${label}: photo viewer`}
          className="lightbox on-dark fixed inset-0 z-[70] flex flex-col bg-ink/95 font-body text-white"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="font-mono text-sm text-cream-200/85" aria-hidden="true">{index + 1} / {total}</p>
            <button ref={closeRef} type="button" onClick={close} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/30 px-4 text-sm font-semibold hover:bg-white/10">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              Close
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div key={current.src} className="lightbox-frame relative h-full w-full">
              <Image src={current.src} alt={current.alt} fill sizes="100vw" className="object-contain" priority />
            </div>

            {total > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-ink/60 text-white ring-1 ring-white/30 hover:bg-vermilion-600 sm:left-4">
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
                </button>
                <button type="button" onClick={() => step(1)} aria-label="Next photo" className="absolute right-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-ink/60 text-white ring-1 ring-white/30 hover:bg-vermilion-600 sm:right-4">
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
                </button>
              </>
            )}
          </div>

          <p className="min-h-[3.5rem] px-5 py-4 text-center text-sm leading-relaxed text-cream-200/90" aria-live="polite">
            <span className="sr-only">Photo {index + 1} of {total}: </span>
            {current.caption || current.alt}
          </p>
        </div>
      )}
    </>
  );
}
