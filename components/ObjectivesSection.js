import Link from 'next/link';
import Reveal from './Reveal';
import { AREAS_OF_WORK } from '../lib/areasOfWorkData';

export default function ObjectivesSection() {
  return (
    <section className="bg-cream-300/60 border-y border-saffron-200 py-20">
      <div className="container-page">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600">Areas of Work</p>
          <h2 className="font-display text-3xl md:text-4xl mt-3 text-ink">Five commitments, one community</h2>
          <p className="text-sm text-ink/70 mt-4 leading-relaxed">The trust deed names five fields of work. Each one runs as its own set of schemes, with its own beneficiaries and its own accounting.</p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-8 mt-14">
          {AREAS_OF_WORK.map((a, i) => (
            <Reveal key={a.slug} delay={i * 80}>
            <Link href={`/areas-of-work/${a.slug}`} className="soft-card block h-full bg-cream-100 rounded-2xl p-7 border border-saffron-200/70 shadow-sm hover:border-vermilion-400">
              <p className="font-display text-3xl text-saffron-500">{String(i + 1).padStart(2, '0')}</p>
              <h3 className="font-display text-xl text-vermilion-700 mt-2">{a.title}</h3>
              <p className="text-sm text-ink/70 mt-3 leading-relaxed">{a.summary}</p>
            </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
