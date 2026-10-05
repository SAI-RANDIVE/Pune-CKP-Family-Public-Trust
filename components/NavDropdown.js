'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * Desktop navigation dropdown. Opens on hover, click, Enter/Space or ArrowDown;
 * closes on Escape (focus returns to the trigger), outside click, or when
 * focus leaves the group.
 */
export default function NavDropdown({ label, items, active = false, pathname = '' }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const closeTimer = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutside(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Return focus to the trigger so keyboard users aren't stranded on a hidden panel.
      triggerRef.current?.focus();
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function openNow() {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  }

  // A short grace period, so moving the pointer diagonally into the panel does not close it.
  function closeSoon() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  }

  function onTriggerKeyDown(event) {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    setOpen(true);
    window.requestAnimationFrame(() => wrapperRef.current?.querySelector('ul a')?.focus());
  }

  function onBlur(event) {
    if (!wrapperRef.current?.contains(event.relatedTarget)) setOpen(false);
  }

  const twoColumns = items.length > 6;

  return (
    <div ref={wrapperRef} className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        aria-expanded={open}
        aria-haspopup="true"
        data-active={active ? 'true' : undefined}
        className="nav-link"
      >
        {label}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={`chev ${open ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2">
          <ul className={`menu-pop rounded-2xl border border-saffron-200 bg-white p-2 shadow-lift ${twoColumns ? 'grid w-[26rem] grid-cols-2' : 'w-72'}`}>
            {items.map((item, index) => (
              <li key={item.href} className={twoColumns && index === 0 ? 'col-span-2' : ''}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === item.href ? 'page' : undefined}
                  className="block rounded-xl px-4 py-2.5 transition-colors hover:bg-saffron-50 focus-visible:bg-saffron-50 aria-[current=page]:bg-saffron-50"
                >
                  <span className="block text-sm font-semibold text-ink">{item.label}</span>
                  {item.note && <span className="mt-0.5 block text-xs leading-snug text-ink/65">{item.note}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
