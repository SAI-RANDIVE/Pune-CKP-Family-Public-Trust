import Link from 'next/link';
import { notFound } from 'next/navigation';
import Breadcrumbs from '../../../../components/Breadcrumbs';
import { AREAS_OF_WORK, getAreaBySlug } from '../../../../lib/areasOfWorkData';
import { buildMetadata } from '../../../../lib/seo';

export function generateStaticParams() {
  return AREAS_OF_WORK.map((area) => ({ slug: area.slug }));
}

export function generateMetadata({ params }) {
  const area = getAreaBySlug(params.slug);
  if (!area) return {};
  return buildMetadata({
    title: `${area.title} Work | Pune CKP Family Public Trust`,
    description: area.metaDescription,
    path: `/areas-of-work/${area.slug}`,
  });
}

export default function AreaDetailPage({ params }) {
  const area = getAreaBySlug(params.slug);
  if (!area) notFound();

  return (
    <div className="container-page py-16 md:py-24">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Areas of Work', href: '/areas-of-work' }, { label: area.title }]} />
      <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">Areas of Work</p>
      <h1 className="font-display text-4xl md:text-5xl text-center mt-3">{area.title}</h1>
      <p className="max-w-2xl mx-auto mt-5 text-center text-lg text-ink/70 leading-relaxed">{area.tagline}</p>

      <div className="grid md:grid-cols-2 gap-8 mt-14">
        <section className="bg-cream-100 border border-saffron-200/70 rounded-2xl p-7">
          <h2 className="font-display text-2xl text-vermilion-700">What we do</h2>
          <p className="text-sm text-ink/70 mt-3 leading-relaxed">{area.summary}</p>
          <ul className="mt-5 space-y-3">
            {area.points.map((point) => <li key={point} className="text-sm text-ink/70 leading-relaxed flex gap-2"><span className="text-vermilion-500 mt-1">•</span><span>{point}</span></li>)}
          </ul>
        </section>
        <section className="bg-cream-100 border border-saffron-200/70 rounded-2xl p-7">
          <h2 className="font-display text-2xl text-vermilion-700">Initiatives</h2>
          <div className="mt-5 space-y-5">
            {area.initiatives.map((initiative) => <div key={initiative.name}><h3 className="font-semibold text-saffron-700">{initiative.name}</h3><p className="text-sm text-ink/70 mt-1.5 leading-relaxed">{initiative.note}</p></div>)}
          </div>
        </section>
      </div>

      <div className="mt-14 flex flex-wrap justify-center gap-3">
        <Link href="/donate" className="rounded-full bg-vermilion-500 text-cream-100 px-6 py-3 font-semibold hover:bg-vermilion-600 transition-colors">Support this work</Link>
        <Link href="/membership" className="rounded-full border-2 border-vermilion-500 text-vermilion-600 px-6 py-3 font-semibold hover:bg-vermilion-50 transition-colors">Join the Trust</Link>
      </div>

      <nav aria-label="Explore other areas" className="mt-14 border-t border-saffron-200 pt-8">
        <h2 className="font-display text-xl text-vermilion-700 text-center">Explore other areas</h2>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-4 text-sm">
          {AREAS_OF_WORK.filter((item) => item.slug !== area.slug).map((item) => <Link key={item.slug} href={`/areas-of-work/${item.slug}`} className="text-ink/70 hover:text-vermilion-600">{item.title}</Link>)}
        </div>
      </nav>
    </div>
  );
}
