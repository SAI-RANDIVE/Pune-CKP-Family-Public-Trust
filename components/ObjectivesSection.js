import Link from 'next/link';
import SectionHeading from './SectionHeading';
import { Stagger } from './Reveal';
import AreaIcon from './AreaIcon';
import { AREAS_OF_WORK } from '../lib/areasOfWorkData';

export function AreaCard({ area, index, headingLevel: Heading = 'h3' }) {
  return (
    <Link href={`/areas-of-work/${area.slug}`} className="card card-hover group relative flex h-full flex-col overflow-hidden p-6 sm:p-7">
      <span className="absolute right-5 top-4 font-display text-5xl leading-none text-saffron-200" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-vermilion-50 text-vermilion-700 transition-colors duration-300 group-hover:bg-vermilion-500 group-hover:text-white">
        <AreaIcon name={area.icon} className="h-6 w-6" />
      </span>
      <Heading className="h-card mt-5">{area.title}</Heading>
      {area.titleMr && <p className="devanagari text-sm text-ink/65" lang="mr">{area.titleMr}</p>}
      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink/75">{area.summary}</p>
      {area.fromVision && <p className="mt-3 inline-flex self-start rounded-full bg-saffron-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-saffron-900">Added in Vision 2021</p>}
      <span className="link-arrow mt-3">Explore <span className="sr-only">{area.title} work</span><span className="arrow" aria-hidden="true">→</span></span>
    </Link>
  );
}

export default function ObjectivesSection() {
  return (
    <section className="border-y border-saffron-200 bg-cream-300/50" aria-labelledby="areas-heading">
      <div className="container-page section-y">
        <SectionHeading
          id="areas-heading"
          eyebrow="Areas of Work"
          title="Five objectives, and a love of the arts"
          intro="The trust deed sets out five fields of work: educational, medical, environmental, social and sports. Vision 2021 added a sixth focus, literature and art."
        />

        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS_OF_WORK.map((area, index) => <AreaCard key={area.slug} area={area} index={index} />)}
        </Stagger>
      </div>
    </section>
  );
}
