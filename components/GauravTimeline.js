import Link from 'next/link';
import SectionHeading from './SectionHeading';
import { Stagger } from './Reveal';
import { GAURAV_SOHALA_EVENTS, GAURAV_SOHALA_PEOPLE_COUNT } from '../lib/gauravSohalaData';

export function SohalaCard({ event, headingLevel: Heading = 'h3' }) {
  return (
    <Link href={`/gaurav-sohala/${event.year}`} className="card card-hover group flex h-full flex-col p-5">
      <div className="flex items-center gap-4">
        <div className={`medallion ${event.cancelled ? 'medallion--silver' : 'medallion--gold'} medallion-hover shrink-0`} style={{ width: '3.75rem', height: '3.75rem' }}>
          <span className="font-mono text-xs font-semibold text-ink/85">{event.year}</span>
        </div>
        <div className="min-w-0">
          <Heading className="font-display text-lg leading-snug text-vermilion-700">{event.headline}</Heading>
          <p className="mt-0.5 text-xs font-medium text-ink/65">{event.date}</p>
        </div>
      </div>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-ink/75">
        {event.location}. {event.attendance}.
      </p>
      <span className="link-arrow mt-2">View {event.year} <span className="arrow" aria-hidden="true">→</span></span>
    </Link>
  );
}

export default function GauravTimeline() {
  const newestFirst = [...GAURAV_SOHALA_EVENTS].sort((a, b) => b.year - a.year);

  return (
    <section className="section-wash border-y border-saffron-200" aria-labelledby="sohala-heading">
      <div className="container-page section-y">
        <SectionHeading
          id="sohala-heading"
          eyebrow="Pune CKP Gaurav Sohala"
          title="Honouring the community, year after year"
          intro={`The trust’s annual felicitation finds the gems of the CKP community and honours their work: ${GAURAV_SOHALA_EVENTS.length} years and ${GAURAV_SOHALA_PEOPLE_COUNT} names so far, from Vir Chakra recipients to doctors, artists and social workers.`}
        />

        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {newestFirst.map((event) => <SohalaCard key={event.year} event={event} />)}
        </Stagger>

        <p className="mt-10 text-center">
          <Link href="/gaurav-sohala" className="btn btn-outline">All Gaurav Sohala ceremonies</Link>
        </p>
      </div>
    </section>
  );
}
