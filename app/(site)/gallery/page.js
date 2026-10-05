import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import { Stagger } from '../../../components/Reveal';
import { AlbumCard } from '../../../components/Cards';
import CtaBanner from '../../../components/CtaBanner';
import JsonLd from '../../../components/JsonLd';
import { buildMetadata, getSiteUrl, absoluteUrl, organizationRef } from '../../../lib/seo';
import { GALLERY_ALBUMS, GALLERY_CATEGORIES, GALLERY_TOTAL_IMAGES, VIDEOS } from '../../../lib/galleryData';

const lead = GALLERY_ALBUMS[0];

export const metadata = buildMetadata({
  title: 'Photo Gallery | Pune CKP Family Public Trust',
  description: 'Photo albums of Pune CKP Family Public Trust: Gaurav Sohala ceremonies, medical camps, relief work, school programmes, literary meets, music and festivals since 2016.',
  path: '/gallery',
  image: lead ? lead.cover.src : undefined,
  imageAlt: lead ? lead.cover.alt : undefined,
});

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function GalleryPage() {
  const siteUrl = getSiteUrl();
  const gallerySchema = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: 'Photo gallery of Pune CKP Family Public Trust',
    description: `${GALLERY_TOTAL_IMAGES} photographs in ${GALLERY_ALBUMS.length} albums.`,
    url: `${siteUrl}/gallery`,
    publisher: organizationRef(),
    hasPart: GALLERY_ALBUMS.map((album) => ({
      '@type': 'ImageGallery',
      name: album.title,
      description: album.description,
      url: `${siteUrl}/gallery/${album.slug}`,
      thumbnailUrl: absoluteUrl(album.cover.src),
    })),
  };

  return (
    <>
      <JsonLd data={gallerySchema} />
      <PageHero
        eyebrow="Gallery"
        title="The CKP family in pictures"
        intro={`${GALLERY_TOTAL_IMAGES} photographs in ${GALLERY_ALBUMS.length} albums: ceremonies, camps, classrooms, relief work and celebrations, from 2016 onwards.`}
        breadcrumbs={[{ label: 'Gallery' }]}
      >
        <Link href="/gallery/videos" className="btn btn-primary">Video gallery ({VIDEOS.length})</Link>
        <Link href="/events" className="btn btn-outline">Events &amp; activities</Link>
      </PageHero>

      <div className="container-page section-y">
        <nav aria-label="Album categories">
          <ul className="flex flex-wrap justify-center gap-2">
            {GALLERY_CATEGORIES.map((category) => (
              <li key={category}>
                <a href={`#${slugify(category)}`} className="inline-flex min-h-[2.75rem] items-center rounded-full border border-saffron-300 bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-vermilion-400 hover:text-vermilion-700">
                  {category}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {GALLERY_CATEGORIES.map((category, groupIndex) => {
          const albums = GALLERY_ALBUMS.filter((album) => album.category === category).sort((a, b) => b.year - a.year);
          const id = slugify(category);
          return (
            <section key={category} id={id} aria-labelledby={`${id}-heading`} className="mt-14 scroll-mt-28">
              <h2 id={`${id}-heading`} className="flex items-center gap-4 font-display text-2xl text-vermilion-700 md:text-3xl">
                {category}
                <span className="h-px flex-1 bg-gradient-to-r from-saffron-400 to-transparent" aria-hidden="true" />
                <span className="font-body text-xs font-semibold uppercase tracking-wide text-ink/65">{albums.length} {albums.length === 1 ? 'album' : 'albums'}</span>
              </h2>
              <Stagger className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {albums.map((album, i) => <AlbumCard key={album.slug} album={album} priority={groupIndex === 0 && i < 3} />)}
              </Stagger>
            </section>
          );
        })}
      </div>

      <CtaBanner />
    </>
  );
}
