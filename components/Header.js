'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import NavDropdown from './NavDropdown';
import { GAURAV_SOHALA_YEARS } from '../lib/gauravSohalaData';

const NAV = [
  { href: '/about', label: 'About Us' },
  { href: '/areas-of-work', label: 'Areas of Work' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/membership', label: 'Membership' },
  { href: '/donate', label: 'Donate' },
  { href: '/contact', label: 'Contact' },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-cream-100/90 backdrop-blur border-b border-saffron-200">
      <div className="container-page flex items-center justify-between h-20">
        <Link href="/" className="flex items-center gap-3">
          <div className="overflow-hidden rounded-full border-2 border-saffron-300 bg-cream-200" style={{ width: '3rem', height: '3rem' }}>
            <Image src="/logo/logo.png" alt="Pune CKP Family Public Trust logo" width={48} height={48} className="h-full w-full object-cover" priority />
          </div>
          <div className="leading-tight">
            <p className="font-display text-lg text-vermilion-600">Pune CKP Family</p>
            <p className="text-[11px] tracking-[0.2em] uppercase text-ink/60">Public Trust</p>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm font-medium text-ink/80 hover:text-vermilion-600 transition-colors">
              {item.label}
            </Link>
          ))}
          <NavDropdown years={GAURAV_SOHALA_YEARS} />
          <Link
            href="/membership"
            className="rounded-full bg-vermilion-500 text-cream-100 px-5 py-2.5 text-sm font-semibold shadow-sm hover:bg-vermilion-600 transition-colors"
          >
            Become a Member
          </Link>
        </nav>

        <button
          className="md:hidden text-ink"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle navigation menu"
          aria-expanded={open}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-saffron-200 bg-cream-100">
          <div className="container-page flex flex-col py-4 gap-4">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="text-ink/80 font-medium">
                {item.label}
              </Link>
            ))}
            <NavDropdown years={GAURAV_SOHALA_YEARS} mobile onNavigate={() => setOpen(false)} />
            <Link href="/membership" onClick={() => setOpen(false)} className="rounded-full bg-vermilion-500 text-cream-100 px-5 py-2.5 text-sm font-semibold text-center">
              Become a Member
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
