import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import PageHero from '../../../../components/PageHero';
import SectionHeading from '../../../../components/SectionHeading';
import Reveal, { Stagger } from '../../../../components/Reveal';
import AreaIcon from '../../../../components/AreaIcon';
import GalleryGrid from '../../../../components/GalleryGrid';
import CtaBanner from '../../../../components/CtaBanner';
import JsonLd from '../../../../components/JsonLd';
import { PersonCard, VideoCard } from '../../../../components/Cards';
import { GAURAV_SOHALA_YEARS, getGauravSohalaByYear, peopleOf } from '../../../../lib/gauravSohalaData';
import { buildMetadata, getSiteUrl, absoluteUrl, organizationRef, pageTitle } from '../../../../lib/seo';
import { siteImage, getAlbum, VIDEOS } from '../../../../lib/galleryData';

export function generateStaticParams() {
  return GAURAV_SOHALA_YEARS.map((year) => ({ year: String(year) }));
}

export const dynamicParams = false;

export function generateMetadata({ params }) {
  const event = getGauravSohalaByYear(params.year);
  if (!event) return {};
  const image = event.image ? siteImage('sohala', event.image) : null;
  return buildMetadata({
    title: pageTitle(`Pune CKP Gaurav Sohala ${event.year}: ${event.headline}`),
    description: event.metaDescription,
    path: `/gaurav-sohala/${event.year}`,
    type: 'article',
    image: image || undefined,
    imageAlt: image ? `Pune CKP Gaurav Sohala ${event.year}` : undefined,
  });
}

export default function GauravSohalaYearPage({ params }) {
  const event = getGauravSohalaByYear(params.year);
  if (!event) notFound();

  const yearIndex = GAURAV_SOHALA_YEARS.indexOf(event.year);
  const newerYear = GAURAV_SOHALA_YEARS[yearIndex - 1];
  const olderYear = GAURAV_SOHALA_YEARS[yearIndex + 1];
  const photoOf = (person) => (person && person.photo ? siteImage('people', person.photo) : null);
  // 2025's lead image is one of its three award posters, which get their own section below.
  const poster = event.image && !event.awards ? siteImage('sohala', event.image) : null;
  const posterAlt = event.image && event.image.startsWith('trophy')
    ? `Trophy of the Pune CKP Gaurav Sohala ${event.year}`
    : `Poster of the Pune CKP Gaurav Sohala ${event.year}`;
  const album = event.albumSlug ? getAlbum(event.albumSlug) : null;
  // The "Sanmaan Sohala" album covers both 2018 and 2019: show only the photos captioned with this year.
  const sharedAlbum = album && album.slug === 'ckp-sanmaan-sohala';
  const albumPhotos = album
    ? album.images.filter((image) => !sharedAlbum || (image.caption || '').includes(String(event.year))).slice(0, 12)
    : [];
  const video = event.videoId ? VIDEOS.find((v) => v.id === event.videoId) : null;
  const dignitaries = [
    event.president && { label: 'President', person: event.president },
    ...(event.chiefGuests || []).map((person) => ({ label: 'Chief Guest', person })),
    event.shiromaniAward && { label: 'Shiromani Award', person: event.shiromaniAward },
  ].filter(Boolean);
  const url = `${getSiteUrl()}/gaurav-sohala/${event.year}`;

  const eventSchema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `Pune CKP Gaurav Sohala ${event.year}`,
    description: event.metaDescription,
    url,
    startDate: event.isoDate,
    location: {
      '@type': 'Place',
      name: event.location,
      address: { '@type': 'PostalAddress', addressLocality: 'Pune', addressRegion: 'Maharashtra', addressCountry: 'IN' },
    },
    organizer: organizationRef(),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: event.cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    ...(poster ? { image: [absoluteUrl(poster)] } : {}),
    ...(event.theme ? { about: event.theme } : {}),
  };

  const facts = [
    { icon: 'calendar', label: 'Date', value: event.date },
    { icon: 'pin', label: 'Venue', value: event.location },
    event.occasion && { icon: 'medal', label: 'Occasion', value: event.occasion },
    event.theme && { icon: 'book', label: 'Theme', value: event.theme, valueMr: event.themeMr },
    { icon: 'users', label: 'Attendance', value: event.attendance },
  ].filter(Boolean);

  return (
    <>
      <JsonLd data={eventSchema} />
      <PageHero
        eyebrow={`Pune CKP Gaurav Sohala ${event.year}`}
        title={`Gaurav Sohala ${event.year}: ${event.headline}`}
        titleMr={`पुणे सीकेपी गौरव सोहळा ${event.year}`}
        breadcrumbs={[{ label: 'CKP Gaurav Sohala', href: '/gaurav-sohala' }, { label: String(event.year) }]}
      />

      <section className="container-page section-y !pb-0">
        <div className={`grid gap-8 ${poster ? 'lg:grid-cols-[1fr,auto]' : ''} lg:gap-12`}>
          <div>
            <h2 className="sr-only">At a glance</h2>
            <Stagger as="ul" className="grid gap-4 sm:grid-cols-2">
              {facts.map((fact) => (
                <li key={fact.label} className="card flex items-start gap-4 p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-vermilion-50 text-vermilion-700"><AreaIcon name={fact.icon} className="h-5 w-5" /></span>
                  <span>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-ink/65">{fact.label}</span>
                    <span className="mt-0.5 block font-medium text-ink">
                      {fact.value}
                      {fact.valueMr && <span className="devanagari ml-2 text-ink/70" lang="mr">{fact.valueMr}</span>}
                    </span>
                  </span>
                </li>
              ))}
            </Stagger>

            {event.cancelled && (
              <Reveal className="mt-6 rounded-2xl border border-saffron-300 bg-saffron-100 p-5">
                <p className="font-display text-lg text-vermilion-700">The ceremony could not be held</p>
                <p className="mt-1 text-sm leading-relaxed text-ink/80">It had to be cancelled because of the Corona pandemic. The awards were not: the people named below were felicitated at their homes.</p>
              </Reveal>
            )}

            {event.summary && (
              <div className="mt-6 space-y-4 text-[0.95rem] leading-relaxed text-ink/80">
                {event.summary.map((paragraph, i) => <Reveal as="p" key={i}>{paragraph}</Reveal>)}
              </div>
            )}
          </div>

          {poster && (
            <Reveal variant="right" className="mx-auto w-full max-w-[16rem] lg:mx-0 lg:w-64">
              <div className="photo-frame relative aspect-[3/4] rounded-3xl border-4 border-white shadow-lift">
                <Image src={poster} alt={posterAlt} fill sizes="256px" className="object-contain" priority />
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {dignitaries.length > 0 && (
        <section className="container-page section-y !pb-0" aria-labelledby="dignitaries-heading">
          <SectionHeading id="dignitaries-heading" eyebrow="Presiding" title={event.shiromaniAward ? 'President and Shiromani awardee' : 'President and chief guest'} />
          <Stagger className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-2">
            {dignitaries.map(({ label, person }) => <PersonCard key={person.name} person={person} photo={photoOf(person)} label={label} large />)}
          </Stagger>
        </section>
      )}

      {event.awards && event.awards.length > 0 && (
        <section className="container-page section-y !pb-0" aria-labelledby="awards-heading">
          <SectionHeading id="awards-heading" eyebrow="The awards" title="Three puraskars" intro="The three awards announced for this ceremony, as shown on its posters." />
          <Stagger as="ul" className="mx-auto mt-10 grid max-w-4xl gap-5 sm:grid-cols-3">
            {event.awards.map((award) => {
              const src = siteImage('sohala', award.image);
              return (
                <li key={award.name} className="card card-hover overflow-hidden">
                  {src && (
                    <div className="photo-frame relative aspect-[3/4]">
                      <Image src={src} alt={`Poster: ${award.name}`} fill sizes="(max-width: 640px) 100vw, 280px" className="object-cover" />
                    </div>
                  )}
                  <h3 className="p-5 text-center font-display text-base leading-snug text-vermilion-700">{award.name}</h3>
                </li>
              );
            })}
          </Stagger>
        </section>
      )}

      {event.honorees.length > 0 && (
        <section className="container-page section-y !pb-0" aria-labelledby="honorees-heading">
          <SectionHeading
            id="honorees-heading"
            eyebrow={`${event.honorees.length} names`}
            title={event.rolesUnstated ? 'President, chief guest and awardees' : 'Awardees'}
            intro={event.rolesUnstated
              ? 'The trust lists everyone for this year under one heading, “अध्यक्ष, प्रमुख पाहुणे आणि पुरस्काराचे मानकरी”, without saying who held which role. They are shown here in the same order.'
              : undefined}
          />
          <Stagger className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {event.honorees.map((person) => <PersonCard key={person.name} person={person} photo={photoOf(person)} />)}
          </Stagger>
        </section>
      )}

      {albumPhotos.length > 0 && (
        <section className="container-page section-y !pb-0" aria-labelledby="year-photos-heading">
          <SectionHeading id="year-photos-heading" eyebrow="Photographs" title="From the album" />
          <div className="mt-10">
            <GalleryGrid images={albumPhotos} label={`Gaurav Sohala ${event.year} photographs`} />
          </div>
          <p className="mt-6 text-center"><Link href={`/gallery/${album.slug}`} className="link-arrow">{album.title}: all {album.count} photos <span className="arrow" aria-hidden="true">→</span></Link></p>
        </section>
      )}

      {video && (
        <section className="container-page section-y !pb-0" aria-labelledby="year-video-heading">
          <SectionHeading id="year-video-heading" eyebrow="On film" title="Watch" />
          <div className="mx-auto mt-10 max-w-md"><VideoCard video={video} /></div>
        </section>
      )}

      <nav aria-label="Other years" className="container-page section-y !pb-0">
        <div className="grid gap-4 sm:grid-cols-2">
          {olderYear ? (
            <Link href={`/gaurav-sohala/${olderYear}`} className="card card-hover p-5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/65"><span aria-hidden="true">← </span>Earlier</span>
              <span className="mt-1 block font-display text-lg text-vermilion-700">Gaurav Sohala {olderYear}</span>
            </Link>
          ) : <span />}
          {newerYear && (
            <Link href={`/gaurav-sohala/${newerYear}`} className="card card-hover p-5 sm:text-right">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/65">Later<span aria-hidden="true"> →</span></span>
              <span className="mt-1 block font-display text-lg text-vermilion-700">Gaurav Sohala {newerYear}</span>
            </Link>
          )}
        </div>
        <p className="mt-8 text-center"><Link href="/gaurav-sohala" className="btn btn-outline">All Gaurav Sohala ceremonies</Link></p>
      </nav>

      <CtaBanner />
    </>
  );
}
