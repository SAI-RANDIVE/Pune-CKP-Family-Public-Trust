import Link from 'next/link';
import Reveal from './Reveal';
import { GAURAV_SOHALA_EVENTS } from '../lib/gauravSohalaData';

export default function GauravTimeline() {
  return (
    <section className="section-wash border-y border-saffron-200 py-20">
      <div className="container-page">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600">CKP Gaurav Sohala</p>
          <h2 className="font-display text-3xl md:text-4xl mt-3 text-ink">Honouring the community, year after year</h2>
          <p className="text-sm text-ink/70 mt-3">
            An annual felicitation ceremony recognising CKP community members for outstanding
            work in the arts, social service, sports, defence, medicine and industry.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 max-w-3xl mx-auto">
          {GAURAV_SOHALA_EVENTS.map((s, i) => (
            <Reveal key={s.year} delay={i * 60}>
            <Link href={`/gaurav-sohala/${s.year}`} className="soft-card flex gap-5 items-start bg-cream-100 rounded-xl p-5 border border-saffron-200/60 hover:border-vermilion-400">
              <div className="medallion medallion--silver medallion-hover shrink-0" style={{ width: '3.75rem', height: '3.75rem' }}>
                <span className="font-mono text-xs font-semibold text-ink/80">{s.year}</span>
              </div>
              <div>
                <p className="font-semibold text-vermilion-700">{s.theme}</p>
                <p className="text-sm text-ink/70 mt-1 leading-relaxed">{s.cancelled ? 'The in-person ceremony was cancelled due to the pandemic; the trust redirected funds to relief work instead.' : `${s.location}, ${s.attendance}.`}</p>
              </div>
            </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
