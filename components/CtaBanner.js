import Link from 'next/link';
import Reveal from './Reveal';
import AreaIcon from './AreaIcon';
import { Mandala } from './Motifs';
import { TRUST } from '../lib/siteData';

/**
 * Closing call to action: two clear paths (donate, join) with the plain facts
 * a donor wants before clicking. Membership fees are the current ones
 * (Silver 1,000 / Gold 5,000 / Platinum 10,000). No tax-deduction promise.
 */
export default function CtaBanner({
  title = 'Give back to the society that gave to you',
  text = 'Become a member from ₹1,000 a year, or make a one-time donation of ₹100 to ₹10,000 online. Every payment is receipted instantly.',
}) {
  return (
    <section className="container-page section-y !pb-0" aria-labelledby="cta-heading">
      <Reveal variant="pop" className="on-dark panel-vermilion relative overflow-hidden rounded-4xl px-6 py-12 text-center shadow-lift sm:px-10 md:px-16 md:py-16">
        <div className="motif-rangoli-light pointer-events-none absolute inset-0" aria-hidden="true" />
        <Mandala spin className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 text-saffron-300/25" />
        <Mandala className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 text-saffron-300/15" />

        <div className="relative">
          <p className="devanagari text-2xl font-semibold text-saffron-300 md:text-3xl" lang="mr">{TRUST.tagline}</p>
          <h2 id="cta-heading" className="h-section mx-auto mt-3 max-w-2xl !text-white">{title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-relaxed text-cream-200/90">{text}</p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/donate" className="btn btn-lg btn-saffron">
              <AreaIcon name="heart" className="h-5 w-5" />
              Donate now
            </Link>
            <Link href="/membership" className="btn btn-lg btn-light">
              <AreaIcon name="users" className="h-5 w-5" />
              Become a member
            </Link>
          </div>

          <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-cream-200/85">
            <li>Registered public trust, Reg. No. {TRUST.regNo}</li>
            <li>Instant PDF receipt</li>
            <li>Secure payment by card, UPI or net banking</li>
            <li><Link href="/donate/bank-transfer" className="underline underline-offset-4 hover:text-white">Bank transfer for larger gifts</Link></li>
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
