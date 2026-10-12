'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import NavDropdown from './NavDropdown';
import { NAV_GROUPS, NAV_LINKS, TRUST } from '../lib/siteData';

function isActive(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function Header() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef(null);
  const drawerRef = useRef(null);
  const closeRef = useRef(null);

  // Shrink the bar once the page has scrolled a little. One passive listener,
  // one rAF per frame at most, and state only changes when the threshold is crossed.
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      setScrolled(window.scrollY > 24);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Navigating closes the drawer.
  useEffect(() => { setOpen(false); }, [pathname]);

  // While the drawer is open: lock page scroll, trap focus inside it, close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 60);

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(drawerRef.current?.querySelectorAll('a[href], button:not([disabled]), summary') || [])
        .filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function closeDrawer() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  return (
    <header className="site-header sticky top-0 z-40" data-scrolled={scrolled ? 'true' : 'false'}>
      <a href="#main-content" className="pointer-events-auto sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-vermilion-700 focus:shadow-lift">
        Skip to main content
      </a>

      <div className="site-bar backdrop-blur-md">
        <div className="container-page flex h-full items-center justify-between gap-4">
          <Link href="/" className="flex min-h-[44px] items-center gap-3" aria-label={`${TRUST.name}: home`}>
            <span className="site-logo block shrink-0 overflow-hidden rounded-full border-2 border-saffron-300 bg-cream-200">
              <Image src="/logo/logo.png" alt="" width={48} height={48} className="h-full w-full object-cover" priority />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-lg text-vermilion-600">Pune CKP Family</span>
              <span className="block text-[11px] uppercase tracking-[0.2em] text-ink/70">Public Trust</span>
            </span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-6 xl:flex">
            {NAV_GROUPS.map((group) => (
              <NavDropdown key={group.label} label={group.label} items={group.items} active={isActive(pathname, group.match)} pathname={pathname} />
            ))}
            {NAV_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="nav-link" aria-current={pathname === item.href ? 'page' : undefined}>
                {item.label}
              </Link>
            ))}
            <span className="flex items-center gap-2.5 pl-1">
              <Link href="/member" className="nav-link" aria-current={pathname.startsWith('/member/') || pathname === '/member' ? 'page' : undefined}>Members</Link>
              <Link href="/membership" className="btn btn-sm btn-outline">Join</Link>
              <Link href="/donate" className="btn btn-sm btn-primary">
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                Donate
              </Link>
            </span>
          </nav>

          <div className="flex items-center gap-2 xl:hidden">
            <Link href="/donate" className="btn btn-sm btn-primary hidden min-[400px]:inline-flex">Donate</Link>
            <button
              ref={toggleRef}
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-saffron-200 bg-white text-ink transition-colors hover:bg-saffron-50"
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={open}
              aria-controls="site-drawer"
            >
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer. It sits outside the blurred bar on purpose: a backdrop-filter
          ancestor would trap position:fixed children inside the bar. */}
      <div className="drawer-backdrop pointer-events-auto fixed inset-0 z-40 bg-ink/50 xl:hidden" data-open={open ? 'true' : 'false'} onClick={closeDrawer} aria-hidden="true" />
      <div
        id="site-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        data-open={open ? 'true' : 'false'}
        {...(open ? {} : { inert: '' })}
        className="drawer pointer-events-auto fixed inset-y-0 right-0 z-50 flex w-[min(22rem,88vw)] flex-col bg-white shadow-lift xl:hidden"
      >
        <div className="flex items-center justify-between border-b border-saffron-200 px-5 py-4">
          <p className="devanagari text-base font-semibold text-vermilion-700">{TRUST.motto}</p>
          <button ref={closeRef} type="button" onClick={closeDrawer} aria-label="Close navigation menu" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-saffron-200 text-ink hover:bg-saffron-50">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="motif-paithani shrink-0" aria-hidden="true" />

        <nav aria-label="Mobile" className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <Link href="/" className="flex min-h-[48px] items-center rounded-xl px-3 font-semibold text-ink hover:bg-saffron-50" aria-current={pathname === '/' ? 'page' : undefined}>Home</Link>
          {NAV_GROUPS.map((group) => (
            <details key={group.label} open={isActive(pathname, group.match)} className="group/details">
              <summary className="flex min-h-[48px] cursor-pointer items-center justify-between rounded-xl px-3 font-semibold text-ink hover:bg-saffron-50">
                {group.label}
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="chev text-vermilion-600"><path d="m6 9 6 6 6-6" /></svg>
              </summary>
              <ul className="mb-2 ml-3 border-l-2 border-saffron-200 pl-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={pathname === item.href ? 'page' : undefined} className="flex min-h-[44px] items-center rounded-lg px-3 text-sm text-ink/80 hover:bg-saffron-50 aria-[current=page]:font-semibold aria-[current=page]:text-vermilion-700">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {NAV_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="flex min-h-[48px] items-center rounded-xl px-3 font-semibold text-ink hover:bg-saffron-50" aria-current={pathname === item.href ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="grid grid-cols-2 gap-3 border-t border-saffron-200 p-4">
          <Link href="/member" className="btn btn-outline col-span-2">Members' corner: sign in</Link>
          <Link href="/membership" className="btn btn-outline">Join</Link>
          <Link href="/donate" className="btn btn-primary">Donate</Link>
          <a href={TRUST.phoneHref} className="col-span-2 flex min-h-[44px] items-center justify-center text-sm font-medium text-ink/75">Call {TRUST.phoneDisplay}</a>
        </div>
      </div>
    </header>
  );
}
