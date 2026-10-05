import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHero from '../../../../components/PageHero';
import SectionHeading from '../../../../components/SectionHeading';
import Reveal, { Stagger } from '../../../../components/Reveal';
import Photo from '../../../../components/Photo';
import AreaIcon from '../../../../components/AreaIcon';
import GalleryGrid from '../../../../components/GalleryGrid';
import CtaBanner from '../../../../components/CtaBanner';
import JsonLd from '../../../../components/JsonLd';
import { VideoCard } from '../../../../components/Cards';
import { buildMetadata, getSiteUrl, absoluteUrl, organizationRef, pageTitle, metaDescription } from '../../../../lib/seo';
import { EVENTS, getEvent } from '../../../../lib/eventsData';
import { coverOf, getAlbum, VIDEOS } from '../../../../lib/galleryData';

export function generateStaticParams() {
  return EVENTS.map((event) => ({ slug: event.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }) {
  const event = getEvent(params.slug);
  if (!event) return {};
  const cover = coverOf(event);
  return buildMetadata({
    title: pageTitle(`${event.title}${event.year && !event.title.includes(String(event.year)) ? ` (${event.year})` : ''}`),
    description: metaDescription(event.summary, 'From the events and activities of Pune CKP Family Public Trust, Pune.'),
    path: `/events/${event.slug}`,
    type: 'article',
    image: cover ? cover.src : undefined,
    imageAlt: cover ? cover.alt : undefined,
  });
}

export default function EventPage({ params }) {
  const event = getEvent(params.slug);
  if (!event) notFound();

  const cover = coverOf(event);
  const albums = (event.albums || []).map(getAlbum).filter(Boolean);
  const photos = albums.flatMap((album) => album.images).slice(0, 16);
  const videos = (event.videos || []).map((id) => VIDEOS.find((v) => v.id === id)).filter(Boolean);
  const index = EVENTS.indexOf(event);
  const earlier = EVENTS[index - 1];
  const later = EVENTS[index + 1];
  const url = `${getSiteUrl()}/events/${event.slug}`;

  // schema.org Event needs a real start date, so it is only emitted where the
  // trust published an exact day. Everything else is described as an Article.
  const schema = event.isoDate
    ? {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.title,
      description: event.summary,
      url,
      startDate: event.startTime ? `${event.isoDate}T${event.startTime}:00+05:30` : event.isoDate,
      ...(event.endTime ? { endDate: `${event.isoDate}T${event.endTime}:00+05:30` } : {}),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: event.venue || 'Maharashtra, India',
        address: { '@type': 'PostalAddress', addressRegion: 'Maharashtra', addressCountry: 'IN' },
      },
      organizer: organizationRef(),
      ...(cover ? { image: [absoluteUrl(cover.src)] } : {}),
    }
    : {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: event.title,
      description: event.summary,
      url,
      author: organizationRef(),
      publisher: organizationRef(),
      ...(cover ? { image: [absoluteUrl(cover.src)] } : {}),
    };

  return (
    <>
      <JsonLd data={schema} />
      <PageHero
        eyebrow={event.category}
        title={event.title}
        titleMr={event.titleMr}
        intro={event.summary}
        breadcrumbs={[{ label: 'Events & Activities', href: '/events' }, { label: event.title }]}
        meta={(
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-ink/80">
            <li className="inline-flex items-center gap-2"><AreaIcon name="calendar" className="h-4 w-4 text-vermilion-600" />{event.date}</li>
            {event.venue && <li className="inline-flex items-center gap-2"><AreaIcon name="pin" className="h-4 w-4 text-vermilion-600" />{event.venue}</li>}
          </ul>
        )}
      />

      {(cover || event.details || event.related) && (
        <section className="container-page section-y !pb-0">
          <div className={`grid gap-10 ${cover && event.details ? 'lg:grid-cols-[1.05fr,0.95fr] lg:gap-14' : ''}`}>
            {(event.details || event.related) && (
              <div className={cover && event.details ? '' : 'mx-auto max-w-3xl'}>
                {event.details && (
                  <>
                    <h2 className="h-section !text-2xl">About this {event.category === 'Relief' || event.category === 'Health camp' ? 'work' : 'event'}</h2>
                    <div className="mt-4 space-y-4 text-[0.95rem] leading-relaxed text-ink/80">
                      {event.details.map((paragraph, i) => <Reveal as="p" key={i}>{paragraph}</Reveal>)}
                    </div>
                  </>
                )}
                {event.related && (
                  <p className="mt-5"><Link href={event.related.href} className="link-arrow">{event.related.label} <span className="arrow" aria-hidden="true">→</span></Link></p>
                )}
              </div>
            )}
            {cover && (
              <Reveal variant="right" className={event.details ? '' : 'mx-auto w-full max-w-3xl'}>
                <figure>
                  <Photo src={cover.src} alt={cover.alt} ratio="aspect-[4/3]" className="rounded-3xl border-4 border-white shadow-lift" sizes="(max-width: 1024px) 100vw, 560px" priority />
                  {cover.caption && <figcaption className="mt-2 text-xs text-ink/65">{cover.caption}</figcaption>}
                </figure>
              </Reveal>
            )}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="container-page section-y !pb-0" aria-labelledby="event-photos-heading">
          <SectionHeading id="event-photos-heading" eyebrow="Photographs" title="From the album" />
          <div className="mt-10">
            <GalleryGrid images={photos} label={`${event.title} photographs`} />
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6">
            {albums.map((album) => (
              <li key={album.slug}><Link href={`/gallery/${album.slug}`} className="link-arrow">{album.title} ({album.count} photos) <span className="arrow" aria-hidden="true">→</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      {videos.length > 0 && (
        <section className="container-page section-y !pb-0" aria-labelledby="event-videos-heading">
          <SectionHeading id="event-videos-heading" eyebrow="Video" title="Watch" />
          <Stagger className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => <VideoCard key={video.id} video={video} />)}
          </Stagger>
        </section>
      )}

      <nav aria-label="More events" className="container-page section-y !pb-0">
        <div className="grid gap-4 sm:grid-cols-2">
          {earlier ? (
            <Link href={`/events/${earlier.slug}`} className="card card-hover group p-5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/65"><span aria-hidden="true">← </span>Earlier</span>
              <span className="mt-1 block font-display text-lg text-vermilion-700">{earlier.title}</span>
            </Link>
          ) : <span />}
          {later && (
            <Link href={`/events/${later.slug}`} className="card card-hover group p-5 sm:text-right">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/65">Later<span aria-hidden="true"> →</span></span>
              <span className="mt-1 block font-display text-lg text-vermilion-700">{later.title}</span>
            </Link>
          )}
        </div>
        <p className="mt-8 text-center"><Link href="/events" className="btn btn-outline">All events and activities</Link></p>
      </nav>

      <CtaBanner />
    </>
  );
}
