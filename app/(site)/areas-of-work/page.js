import Link from 'next/link';
import { AREAS_OF_WORK } from '../../../lib/areasOfWorkData';
import { buildMetadata } from '../../../lib/seo';

export const metadata = buildMetadata({
  title: 'Areas of Work | Pune CKP Family Public Trust',
  description: 'Education, medical aid, environment, social welfare and sport — the five commitments that guide Pune CKP Family Public Trust’s work across the community.',
  path: '/areas-of-work',
});

export default function AreasOfWorkPage() {
  return (
    <div className="container-page py-16 md:py-24">
      <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">Our Work</p>
      <h1 className="font-display text-4xl md:text-5xl text-center mt-3">Areas of Work</h1>
      <p className="max-w-2xl mx-auto mt-5 text-center text-ink/70 leading-relaxed">Five commitments guide the trust’s work for a stronger, healthier and more connected CKP community.</p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mt-14">
        {AREAS_OF_WORK.map((area, index) => (
          <Link key={area.slug} href={`/areas-of-work/${area.slug}`} className="bg-cream-100 rounded-2xl p-7 border border-saffron-200/70 shadow-sm hover:border-vermilion-400 transition-colors">
            <p className="font-display text-3xl text-saffron-500">{String(index + 1).padStart(2, '0')}</p>
            <h2 className="font-display text-xl text-vermilion-700 mt-2">{area.title}</h2>
            <p className="text-sm text-ink/70 mt-3 leading-relaxed">{area.summary}</p>
            <span className="inline-block mt-5 text-sm font-semibold text-vermilion-600">Explore {area.title} work →</span>
          </Link>
        ))}
      </div>

      <div className="mt-16 text-center">
        <p className="text-sm text-ink/70">Help extend this work across the community.</p>
        <div className="flex flex-wrap justify-center gap-3 mt-5">
          <Link href="/membership" className="rounded-full bg-vermilion-500 text-cream-100 px-6 py-3 font-semibold hover:bg-vermilion-600 transition-colors">Join the Trust</Link>
          <Link href="/donate" className="rounded-full border-2 border-vermilion-500 text-vermilion-600 px-6 py-3 font-semibold hover:bg-vermilion-50 transition-colors">Donate Online</Link>
        </div>
      </div>
    </div>
  );
}
