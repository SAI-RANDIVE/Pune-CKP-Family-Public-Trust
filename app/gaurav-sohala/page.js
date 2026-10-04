import Link from 'next/link';
import Breadcrumbs from '../../components/Breadcrumbs';
import { GAURAV_SOHALA_EVENTS } from '../../lib/gauravSohalaData';
import { buildMetadata } from '../../lib/seo';

export const metadata = buildMetadata({
  title: 'CKP Gaurav Sohala | Pune CKP Family Public Trust',
  description: 'Explore every CKP Gaurav Sohala from 2018 to 2025 — the honourees, presidents and chief guests celebrated by Pune CKP Family Public Trust each year.',
  path: '/gaurav-sohala',
});

export default function GauravSohalaPage() {
  return (
    <div className="container-page py-16 md:py-24">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'CKP Gaurav Sohala' }]} />
      <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">CKP Gaurav Sohala</p>
      <h1 className="font-display text-4xl md:text-5xl text-center mt-3">Honouring the community, year after year</h1>
      <p className="max-w-2xl mx-auto mt-5 text-center text-ink/70 leading-relaxed">The Gaurav Sohala recognises CKP community members for outstanding work in the arts, social service, sports, defence, medicine and industry.</p>

      <div className="mt-14 grid gap-5 max-w-3xl mx-auto">
        {GAURAV_SOHALA_EVENTS.map((event) => (
          <Link key={event.year} href={`/gaurav-sohala/${event.year}`} className="flex gap-5 items-start bg-cream-100 rounded-xl p-5 border border-saffron-200/60 hover:border-vermilion-400 transition-colors">
            <div className="medallion medallion--silver shrink-0" style={{ width: '3.75rem', height: '3.75rem' }}>
              <span className="font-mono text-xs font-semibold text-ink/80">{event.year}</span>
            </div>
            <div>
              <h2 className="font-semibold text-vermilion-700">{event.theme}</h2>
              <p className="text-sm text-ink/70 mt-1 leading-relaxed">{event.attendance}. {event.cancelled ? 'The ceremony was cancelled due to the pandemic; relief work continued.' : `${event.location}.`}</p>
              <span className="inline-block mt-2 text-sm font-semibold text-vermilion-600">View {event.year} details →</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-14 text-center">
        <Link href="/membership" className="rounded-full bg-vermilion-500 text-cream-100 px-6 py-3 font-semibold hover:bg-vermilion-600 transition-colors">Join the community</Link>
        <Link href="/donate" className="ml-3 rounded-full border-2 border-vermilion-500 text-vermilion-600 px-6 py-3 font-semibold hover:bg-vermilion-50 transition-colors">Support the trust</Link>
      </div>
    </div>
  );
}
