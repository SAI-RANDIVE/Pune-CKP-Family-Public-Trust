import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import SectionHeading from '../../../components/SectionHeading';
import Reveal, { Stagger } from '../../../components/Reveal';
import Photo from '../../../components/Photo';
import GalleryGrid from '../../../components/GalleryGrid';
import CtaBanner from '../../../components/CtaBanner';
import JsonLd from '../../../components/JsonLd';
import { SohalaCard } from '../../../components/GauravTimeline';
import { VideoCard } from '../../../components/Cards';
import { GAURAV_SOHALA_EVENTS, GAURAV_SOHALA_PEOPLE_COUNT } from '../../../lib/gauravSohalaData';
import { buildMetadata, getSiteUrl } from '../../../lib/seo';
import { findImage, albumPreview, VIDEOS } from '../../../lib/galleryData';

const lead = findImage('ckp-sanmaan-sohala', 'Gaurav-Sohala-26-January-2019');

export const metadata = buildMetadata({
  title: 'Pune CKP Gaurav Sohala 2018 to 2025 | Pune CKP Family Public Trust',
  description: 'Every Pune CKP Gaurav Sohala from 2018 to 2025: the annual felicitation of CKP achievers, with dates, venues, themes and the people honoured each year.',
  path: '/gaurav-sohala',
  image: lead ? lead.src : undefined,
  imageAlt: lead ? lead.alt : undefined,
});

export default function GauravSohalaPage() {
  const newestFirst = [...GAURAV_SOHALA_EVENTS].sort((a, b) => b.year - a.year);
  const photos = albumPreview('ckp-sanmaan-sohala', 8);
  const films = VIDEOS.filter((video) => video.category === 'Gaurav Sohala');

  const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Pune CKP Gaurav Sohala ceremonies',
    numberOfItems: newestFirst.length,
    itemListElement: newestFirst.map((event, i) => ({ '@type': 'ListItem', position: i + 1, name: `Pune CKP Gaurav Sohala ${event.year}`, url: `${getSiteUrl()}/gaurav-sohala/${event.year}` })),
  };

  return (
    <>
      <JsonLd data={listSchema} />
      <PageHero
        eyebrow="Pune CKP Gaurav Sohala"
        title="Honouring the community, year after year"
        titleMr="पुणे सीकेपी गौरव सोहळा"
        intro={`The trust set out to find the gems of the CKP community and honour their work: people who have gone beyond the boundaries of caste and worked for the welfare of society and the country. ${newestFirst.length} years, ${GAURAV_SOHALA_PEOPLE_COUNT} names.`}
        breadcrumbs={[{ label: 'CKP Gaurav Sohala' }]}
      />

      <section className="container-page section-y">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr,1fr] lg:gap-14">
          <div>
            <SectionHeading align="start" eyebrow="How it began" title="A Shiromani award on Gudi Padwa" />
            <Reveal className="mt-6 space-y-4 text-[0.95rem] leading-relaxed text-ink/80">
              <p>
                The group decided to honour one of its respected members, Shri Sudhir Vaidya, with the &ldquo;Shiromani&rdquo; award. That
                first Gaurav Sohala was held on 18 March 2018, on the auspicious occasion of Gudi Padwa, and ten others with
                significant achievements in the arts, social work and industry were honoured with him.
              </p>
              <p>
                To award Gaurav Puraskars to people whose work is worth recognising, in social and religious work, the arts,
                academics and sport, is one of the objectives written into the trust deed. The ceremony has also been an occasion
                for giving: donations to charitable institutions have been presented from its stage.
              </p>
            </Reveal>
          </div>
          {lead && (
            <Reveal variant="right">
              <figure>
                <Photo src={lead.src} alt={lead.alt} ratio="aspect-[4/3]" className="rounded-3xl border-4 border-white shadow-lift" sizes="(max-width: 1024px) 100vw, 540px" priority />
                <figcaption className="mt-2 text-xs text-ink/65">Gaurav Sohala, 26 January 2019.</figcaption>
              </figure>
            </Reveal>
          )}
        </div>
      </section>

      <section className="border-y border-saffron-200 bg-cream-300/50" aria-labelledby="years-heading">
        <div className="container-page section-y">
          <SectionHeading id="years-heading" eyebrow="2018 to 2025" title="Every ceremony" />
          <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {newestFirst.map((event) => <SohalaCard key={event.year} event={event} />)}
          </Stagger>
        </div>
      </section>

      {photos.length > 0 && (
        <section className="container-page section-y" aria-labelledby="sohala-photos-heading">
          <SectionHeading id="sohala-photos-heading" eyebrow="Photographs" title="From the Sanmaan Sohala album" />
          <div className="mt-10">
            <GalleryGrid images={photos} label="Gaurav Sohala photographs" />
          </div>
          <p className="mt-6 text-center"><Link href="/gallery/ckp-sanmaan-sohala" className="link-arrow">Open the full album <span className="arrow" aria-hidden="true">→</span></Link></p>
        </section>
      )}

      {films.length > 0 && (
        <section className="border-t border-saffron-200 bg-white/60" aria-labelledby="sohala-films-heading">
          <div className="container-page section-y">
            <SectionHeading id="sohala-films-heading" eyebrow="On film" title="Watch the ceremonies" />
            <Stagger className="mx-auto mt-10 grid max-w-3xl gap-5 sm:grid-cols-2">
              {films.map((video) => <VideoCard key={video.id} video={video} />)}
            </Stagger>
          </div>
        </section>
      )}

      <CtaBanner />
    </>
  );
}
