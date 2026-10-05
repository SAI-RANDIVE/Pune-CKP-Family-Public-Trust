import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHero from '../../../../components/PageHero';
import SectionHeading from '../../../../components/SectionHeading';
import Reveal, { Stagger } from '../../../../components/Reveal';
import Photo from '../../../../components/Photo';
import AreaIcon from '../../../../components/AreaIcon';
import CtaBanner from '../../../../components/CtaBanner';
import { AREAS_OF_WORK, getAreaBySlug } from '../../../../lib/areasOfWorkData';
import { coverOf } from '../../../../lib/galleryData';
import { buildMetadata } from '../../../../lib/seo';

export function generateStaticParams() {
  return AREAS_OF_WORK.map((area) => ({ slug: area.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }) {
  const area = getAreaBySlug(params.slug);
  if (!area) return {};
  const cover = coverOf(area);
  return buildMetadata({
    title: `${area.title} Work | Pune CKP Family Public Trust`,
    description: area.metaDescription,
    path: `/areas-of-work/${area.slug}`,
    image: cover ? cover.src : undefined,
    imageAlt: cover ? cover.alt : undefined,
  });
}

export default function AreaDetailPage({ params }) {
  const area = getAreaBySlug(params.slug);
  if (!area) notFound();
  const cover = coverOf(area);
  const others = AREAS_OF_WORK.filter((item) => item.slug !== area.slug);

  return (
    <>
      <PageHero
        eyebrow={area.fromVision ? 'Areas of Work · Vision 2021' : 'Areas of Work'}
        title={area.title}
        titleMr={area.titleMr}
        intro={area.tagline}
        breadcrumbs={[{ label: 'Areas of Work', href: '/areas-of-work' }, { label: area.title }]}
      />

      <section className="container-page section-y">
        <div className="grid gap-8 lg:grid-cols-[1fr,1fr] lg:gap-12">
          <Reveal variant="left">
            <div className="card h-full p-6 sm:p-8">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-vermilion-50 text-vermilion-700"><AreaIcon name={area.icon} /></span>
                <h2 className="h-section !text-2xl">{area.fromVision ? 'What Vision 2021 set out' : 'Objectives in the trust deed'}</h2>
              </div>
              <p className="mt-4 text-[0.95rem] leading-relaxed text-ink/80">{area.summary}</p>
              <ul className="mt-5 space-y-3">
                {area.points.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-ink/75">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-saffron-500" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal variant="right">
            {cover ? (
              <figure className="h-full">
                <Photo src={cover.src} alt={cover.alt} ratio="aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[22rem]" className="rounded-3xl border-4 border-white shadow-lift" sizes="(max-width: 1024px) 100vw, 540px" priority />
              </figure>
            ) : (
              <div className="motif-rangoli flex h-full min-h-[14rem] flex-col items-center justify-center rounded-3xl border border-saffron-200 bg-cream-300/50 p-8 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-vermilion-700 shadow-soft"><AreaIcon name={area.icon} className="h-8 w-8" /></span>
                <p className="mt-5 max-w-xs font-display text-xl text-vermilion-700">{area.tagline}</p>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      <section className="border-y border-saffron-200 bg-cream-300/50" aria-labelledby="initiatives-heading">
        <div className="container-page section-y">
          <SectionHeading id="initiatives-heading" eyebrow="In practice" title="Schemes and work on record" />
          <Stagger className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {area.initiatives.map((item) => {
              const inner = (
                <>
                  <h3 className="h-card">{item.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-ink/75">{item.note}</p>
                  {item.href && <span className="link-arrow mt-2">Read more <span className="arrow" aria-hidden="true">→</span></span>}
                </>
              );
              return item.href ? (
                <Link key={item.name} href={item.href} className="card card-hover group flex h-full flex-col p-6">{inner}</Link>
              ) : (
                <div key={item.name} className="card flex h-full flex-col p-6">{inner}</div>
              );
            })}
          </Stagger>
          <Reveal className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/donate" className="btn btn-primary">Support this work</Link>
            <Link href="/membership" className="btn btn-outline">Join the trust</Link>
          </Reveal>
        </div>
      </section>

      <nav aria-labelledby="other-areas-heading" className="container-page section-y !pb-0">
        <h2 id="other-areas-heading" className="h-card text-center">Explore the other areas</h2>
        <ul className="mt-6 flex flex-wrap justify-center gap-3">
          {others.map((item) => (
            <li key={item.slug}>
              <Link href={`/areas-of-work/${item.slug}`} className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-full border border-saffron-300 bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-vermilion-400 hover:text-vermilion-700">
                <AreaIcon name={item.icon} className="h-4 w-4 text-vermilion-600" />
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <CtaBanner />
    </>
  );
}
