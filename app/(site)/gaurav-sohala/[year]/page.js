import Link from 'next/link';
import { notFound } from 'next/navigation';
import Breadcrumbs from '../../../../components/Breadcrumbs';
import JsonLd from '../../../../components/JsonLd';
import Reveal from '../../../../components/Reveal';
import { GAURAV_SOHALA_EVENTS, GAURAV_SOHALA_YEARS, getGauravSohalaByYear } from '../../../../lib/gauravSohalaData';
import { buildMetadata, getSiteUrl } from '../../../../lib/seo';

const START_DATES = {
  2018: '2018-03-18',
  2019: '2019-01-26',
  2020: '2020-03-28',
  2021: '2021-12-26',
  2022: '2022-05-13',
  2023: '2023-05-14',
  2024: '2024-05-05',
  2025: '2025-05-17',
};

export function generateStaticParams() {
  return GAURAV_SOHALA_YEARS.map((year) => ({ year: String(year) }));
}

export function generateMetadata({ params }) {
  const event = getGauravSohalaByYear(params.year);
  if (!event) return {};
  return buildMetadata({
    title: `Gaurav Sohala ${event.year} | Pune CKP Family Public Trust`,
    description: event.metaDescription,
    path: `/gaurav-sohala/${event.year}`,
    type: 'article',
  });
}

function PersonCard({ label, person, className = 'medallion--gold' }) {
  if (!person) return null;
  return (
    <div className="bg-cream-100 border border-saffron-200/70 rounded-2xl p-6 flex gap-4 items-start">
      <div className={`medallion ${className} shrink-0`} style={{ width: '3.5rem', height: '3.5rem' }}><span className="font-display text-vermilion-700">G</span></div>
      <div><p className="text-xs font-semibold tracking-wide uppercase text-saffron-700">{label}</p><h3 className="font-display text-lg text-vermilion-700 mt-1">{person.name}</h3>{person.note && <p className="text-sm text-ink/70 mt-1.5 leading-relaxed">{person.note}</p>}</div>
    </div>
  );
}

export default function GauravSohalaYearPage({ params }) {
  const event = getGauravSohalaByYear(params.year);
  if (!event) notFound();
  const yearIndex = GAURAV_SOHALA_YEARS.indexOf(event.year);
  const newerYear = GAURAV_SOHALA_YEARS[yearIndex - 1];
  const olderYear = GAURAV_SOHALA_YEARS[yearIndex + 1];
  // Tolerate both shapes: a single chiefGuest (legacy) or a chiefGuests array.
  const chiefGuests = event.chiefGuests || (event.chiefGuest ? [event.chiefGuest] : []);
  const hasDignitaries = Boolean(event.president || chiefGuests.length || event.shiromaniAward);
  const eventSchema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `CKP Gaurav Sohala ${event.year} — ${event.theme}`,
    description: event.metaDescription,
    url: `${getSiteUrl()}/gaurav-sohala/${event.year}`,
    startDate: START_DATES[event.year],
    location: { '@type': 'Place', name: event.location },
    organizer: { '@type': 'Organization', name: 'Pune CKP Family Public Trust', url: getSiteUrl() },
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: event.cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
  };

  return (
    <div className="container-page py-16 md:py-24">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'CKP Gaurav Sohala', href: '/gaurav-sohala' }, { label: String(event.year) }]} />
      <JsonLd data={eventSchema} />
      <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">CKP Gaurav Sohala {event.year}</p>
      <h1 className="font-display text-4xl md:text-5xl text-center mt-3">{event.theme}</h1>
      <p className="max-w-2xl mx-auto mt-5 text-center text-ink/70 leading-relaxed">{event.date} · {event.location}{event.occasion ? ` · ${event.occasion}` : ''} · {event.attendance}</p>

      {event.cancelled && <div className="max-w-3xl mx-auto mt-10 bg-saffron-100 border border-saffron-300 rounded-2xl p-6"><h2 className="font-display text-xl text-vermilion-700">Ceremony cancelled</h2><p className="text-sm text-ink/70 mt-2 leading-relaxed">The planned ceremony was cancelled due to the COVID-19 pandemic, and the trust redirected funds to relief work for people and families in need. Read more in the <Link href="/about#milestones" className="text-vermilion-600 hover:text-vermilion-700">trust milestones</Link>.</p></div>}

      {hasDignitaries && (
        <section className="mt-14 max-w-4xl mx-auto">
          <h2 className="font-display text-2xl text-vermilion-700 text-center">Presiding dignitaries</h2>
          <div className="grid md:grid-cols-2 gap-6 mt-8">
            <PersonCard label="President" person={event.president} />
            {chiefGuests.map((guest, i) => (
              <Reveal key={guest.name} delay={i * 70}>
                <PersonCard label={chiefGuests.length > 1 ? `Chief Guest ${i + 1}` : 'Chief Guest'} person={guest} />
              </Reveal>
            ))}
            {event.shiromaniAward && <PersonCard label="Shiromani Award" person={event.shiromaniAward} />}
          </div>
        </section>
      )}

      {event.honorees.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-2xl text-vermilion-700 text-center">Honourees</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {event.honorees.map((honoree, i) => (
              <Reveal key={honoree.name} delay={i * 50}>
                <div className="soft-card h-full bg-cream-100 border border-saffron-200/70 rounded-2xl p-6">
                  <div className="medallion medallion--silver medallion-hover" style={{ width: '2.75rem', height: '2.75rem' }}>
                    <span className="font-display text-vermilion-700">G</span>
                  </div>
                  <h3 className="font-display text-lg text-vermilion-700 mt-4">{honoree.name}</h3>
                  {honoree.award && (
                    <p className="mt-1.5 inline-block rounded-full bg-saffron-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-saffron-800">
                      {honoree.award}
                    </p>
                  )}
                  {honoree.note && <p className="text-sm text-ink/70 mt-2 leading-relaxed">{honoree.note}</p>}
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* Years where the trust published award categories but not recipients. */}
      {event.awards?.length > 0 && (
        <section className="mt-14 max-w-3xl mx-auto">
          <h2 className="font-display text-2xl text-vermilion-700 text-center">Awards presented</h2>
          <div className="grid sm:grid-cols-3 gap-5 mt-8">
            {event.awards.map((award, i) => (
              <Reveal key={award} delay={i * 70}>
                <div className="soft-card h-full bg-cream-100 border border-saffron-200/70 rounded-2xl p-6 text-center">
                  <div className="medallion medallion--gold medallion-hover mx-auto" style={{ width: '2.75rem', height: '2.75rem' }}>
                    <span className="font-display text-vermilion-700">G</span>
                  </div>
                  <h3 className="font-display text-base text-vermilion-700 mt-4">{award}</h3>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="text-center text-xs text-ink/50 mt-6">
            The trust has not yet published the individual recipients for {event.year}.
          </p>
        </section>
      )}

      <div className="mt-14 flex flex-wrap justify-center gap-3">
        {olderYear && <Link href={`/gaurav-sohala/${olderYear}`} className="rounded-full border-2 border-vermilion-500 text-vermilion-600 px-5 py-3 font-semibold hover:bg-vermilion-50 transition-colors">Older: {olderYear}</Link>}
        {newerYear && <Link href={`/gaurav-sohala/${newerYear}`} className="rounded-full border-2 border-vermilion-500 text-vermilion-600 px-5 py-3 font-semibold hover:bg-vermilion-50 transition-colors">Newer: {newerYear}</Link>}
        <Link href="/donate" className="rounded-full bg-vermilion-500 text-cream-100 px-5 py-3 font-semibold hover:bg-vermilion-600 transition-colors">Support the trust</Link>
      </div>
    </div>
  );
}
