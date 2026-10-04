'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export default function NavDropdown({ years, mobile = false, onNavigate }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);

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

  function navigate() {
    setOpen(false);
    onNavigate?.();
  }

  if (mobile) {
    return (
      <div ref={wrapperRef}>
        <button ref={triggerRef} type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="true" aria-expanded={open} className="w-full flex items-center justify-between text-ink/80 font-medium">
          <span>CKP Gaurav Sohala</span>
          <span aria-hidden="true" className="text-vermilion-600">{open ? '−' : '+'}</span>
        </button>
        {open && <ul className="mt-3 ml-4 space-y-3 border-l-2 border-saffron-200 pl-4" role="menu">
          <li role="none"><Link role="menuitem" href="/gaurav-sohala" onClick={navigate} className="text-sm font-semibold text-vermilion-700">All Years</Link></li>
          {years.map((year) => <li role="none" key={year}><Link role="menuitem" href={`/gaurav-sohala/${year}`} onClick={navigate} className="text-sm text-ink/70">{year}</Link></li>)}
        </ul>}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button ref={triggerRef} type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="true" aria-expanded={open} className="flex items-center gap-1 text-sm font-medium text-ink/80 hover:text-vermilion-600 transition-colors">
        CKP Gaurav Sohala
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <ul role="menu" className="absolute left-1/2 top-full z-50 mt-3 min-w-52 -translate-x-1/2 rounded-2xl border border-saffron-200 bg-cream-100 p-2 shadow-lg">
        <li role="none"><Link role="menuitem" href="/gaurav-sohala" onClick={navigate} className="block rounded-xl px-4 py-2 text-sm font-semibold text-vermilion-700 hover:bg-saffron-50">All Years</Link></li>
        <li role="none" className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/40">Celebrations</li>
        {years.map((year) => <li role="none" key={year}><Link role="menuitem" href={`/gaurav-sohala/${year}`} onClick={navigate} className="block rounded-xl px-4 py-2 text-sm text-ink/80 hover:bg-saffron-50">Gaurav Sohala {year}</Link></li>)}
      </ul>}
    </div>
  );
}
