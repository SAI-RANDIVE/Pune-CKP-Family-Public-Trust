import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import EventsBrowser from '../../../components/EventsBrowser';
import SectionHeading from '../../../components/SectionHeading';
import Reveal from '../../../components/Reveal';
import CtaBanner from '../../../components/CtaBanner';
import JsonLd from '../../../components/JsonLd';
import { buildMetadata, getSiteUrl } from '../../../lib/seo';
import { EVENTS, EVENTS_NEWEST_FIRST, EVENT_YEARS, EVENT_CATEGORIES } from '../../../lib/eventsData';
import { coverOf, VIDEOS } from '../../../lib/galleryData';

export const metadata = buildMetadata({
  title: 'Events & Activities | Pune CKP Family Public Trust',
  description: 'Medical camps, relief work, school programmes, literary meets, music evenings and festivals organised by Pune CKP Family Public Trust from 2016 onwards.',
  path: '/events',
});

function imageFor(event) {
  const cover = coverOf(event);
  if (cover) return { src: cover.src, alt: cover.alt };
  const video = event.videos && VIDEOS.find((v) => v.id === event.videos[0]);
  return video ? { src: video.thumbnail, alt: `Video still: ${video.title}` } : null;
}

export default function EventsPage() {
  const groups = [
    ...EVENT_YEARS.map((year) => ({
      id: `events-${year}`,
      label: String(year),
      items: EVENTS_NEWEST_FIRST.filter((e) => e.year === year).map((event) => ({ event, image: imageFor(event) })),
    })),
    {
      id: 'events-undated',
      label: 'On video',
      items: EVENTS.filter((e) => !e.year).map((event) => ({ event, image: imageFor(event) })),
    },
  ].filter((group) => group.items.length > 0);

  const categories = EVENT_CATEGORIES.filter((name) => EVENTS.some((e) => e.category === name));

  const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Events and activities of Pune CKP Family Public Trust',
    numberOfItems: EVENTS.length,
    itemListElement: EVENTS_NEWEST_FIRST.map((event, i) => ({ '@type': 'ListItem', position: i + 1, name: event.title, url: `${getSiteUrl()}/events/${event.slug}` })),
  };

  return (
    <>
      <JsonLd data={listSchema} />
      <PageHero
        eyebrow="Events & Activities"
        title="What the family has been doing"
        intro={`${EVENTS.length} events and activities since 2016: medical camps, relief work, school programmes, literary meets, music and festivals. The annual Gaurav Sohala has its own pages.`}
        breadcrumbs={[{ label: 'Events & Activities' }]}
      >
        <Link href="/gaurav-sohala" className="btn btn-primary">Gaurav Sohala</Link>
        <Link href="/gallery" className="btn btn-outline">Photo gallery</Link>
      </PageHero>

      <div className="container-page section-y">
        <EventsBrowser groups={groups} categories={categories} />
      </div>

      <section className="border-y border-saffron-200 bg-cream-300/50">
        <div className="container-page section-y text-center">
          <SectionHeading eyebrow="2024 and 2025" title="The Gaurav Sohala continues" intro="For 2024 and 2025 the trust’s published record is the Gaurav Sohala of each year." />
          <Reveal className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/gaurav-sohala/2025" className="btn btn-primary">Gaurav Sohala 2025</Link>
            <Link href="/gaurav-sohala/2024" className="btn btn-outline">Gaurav Sohala 2024</Link>
            <Link href="/milestones" className="btn btn-outline">All milestones</Link>
          </Reveal>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
