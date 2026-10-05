import Link from 'next/link';
import CountUp from './CountUp';
import SectionHeading from './SectionHeading';
import Reveal, { Stagger } from './Reveal';
import AreaIcon from './AreaIcon';
import { CONTRIBUTION_COUNTERS, CONTRIBUTION_TOTAL } from '../lib/impactData';

const ICONS = { education: 'book', health: 'heart', social: 'hands', environment: 'leaf' };

/** Donations & Contributions: the four published totals, by cause. */
export default function StatsSection({ heading = true }) {
  return (
    <section className="container-page section-y" aria-labelledby={heading ? 'contributions-heading' : undefined}>
      {!heading && <h2 className="sr-only">Contributions by cause</h2>}
      {heading && (
        <SectionHeading
          id="contributions-heading"
          eyebrow="Donations & Contributions"
          title="Where the trust’s support has gone"
          intro="The donations and contributions made by the trust for various important causes, as it has published them."
        />
      )}

      <Stagger as="ul" className={`${heading ? 'mt-12' : ''} grid gap-5 sm:grid-cols-2 lg:grid-cols-4`}>
        {CONTRIBUTION_COUNTERS.map((item) => {
          const share = Math.max(3, Math.round((item.amount / CONTRIBUTION_TOTAL) * 100));
          return (
            <li key={item.key} className="card card-hover flex flex-col p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-saffron-100 text-vermilion-700">
                <AreaIcon name={ICONS[item.key]} className="h-6 w-6" />
              </span>
              <p className="mt-5 font-display text-3xl leading-none text-vermilion-700">
                <CountUp value={item.amount} prefix="₹" />
              </p>
              <h3 className="mt-3 text-sm font-semibold text-ink">{item.label}</h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-ink/70">{item.note}</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-cream-300" aria-hidden="true">
                <div className="h-full rounded-full bg-gradient-to-r from-saffron-500 to-vermilion-500" style={{ width: `${share}%` }} />
              </div>
              <Link href={item.href} className="link-arrow mt-2">See the work <span className="arrow" aria-hidden="true">→</span></Link>
            </li>
          );
        })}
      </Stagger>

      <Reveal className="mt-10 flex flex-col items-center justify-between gap-4 rounded-3xl border border-saffron-200 bg-cream-300/50 px-6 py-5 text-center md:flex-row md:text-left">
        <p className="text-sm leading-relaxed text-ink/80">
          Together these come to{' '}
          <strong className="font-mono font-semibold text-vermilion-700">₹{CONTRIBUTION_TOTAL.toLocaleString('en-IN')}</strong>.
          The trust plans a further ₹40 lakh and more on upcoming projects, and aims to take its total social contribution to ₹1 crore in 2026–27.
        </p>
        <Link href="/impact" className="btn btn-sm btn-outline shrink-0">See the full ledger</Link>
      </Reveal>
    </section>
  );
}
