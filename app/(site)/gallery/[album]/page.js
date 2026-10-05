import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHero from '../../../../components/PageHero';
import GalleryGrid from '../../../../components/GalleryGrid';
import AreaIcon from '../../../../components/AreaIcon';
import CtaBanner from '../../../../components/CtaBanner';
import JsonLd from '../../../../components/JsonLd';
import { buildMetadata, getSiteUrl, absoluteUrl, organizationRef, pageTitle, metaDescription } from '../../../../lib/seo';
import { GALLERY_ALBUMS, getAlbum } from '../../../../lib/galleryData';
import { EVENTS } from '../../../../lib/eventsData';

export function generateStaticParams() {
  return GALLERY_ALBUMS.map((album) => ({ album: album.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }) {
  const album = getAlbum(params.album);
  if (!album) return {};
  return buildMetadata({
    title: pageTitle(`${album.title}: Photos`),
    description: metaDescription(album.description, `${album.count} photographs from the albums of Pune CKP Family Public Trust.`),
    path: `/gallery/${album.slug}`,
    image: album.cover.src,
    imageAlt: album.cover.alt,
  });
}

export default function AlbumPage({ params }) {
  const album = getAlbum(params.album);
  if (!album) notFound();

  const siteUrl = getSiteUrl();
  const index = GALLERY_ALBUMS.indexOf(album);
  const previous = GALLERY_ALBUMS[index - 1];
  const next = GALLERY_ALBUMS[index + 1];
  // Year albums mix several occasions, so they do not point at one event.
  const event = album.category === 'Year albums' ? null : EVENTS.find((e) => (e.albums || []).includes(album.slug));
  const isSohala = album.category === 'Gaurav Sohala';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: album.title,
    description: album.description,
    url: `${siteUrl}/gallery/${album.slug}`,
    isPartOf: { '@type': 'ImageGallery', name: 'Photo gallery of Pune CKP Family Public Trust', url: `${siteUrl}/gallery` },
    publisher: organizationRef(),
    image: album.images.map((image) => ({
      '@type': 'ImageObject',
      contentUrl: absoluteUrl(image.src),
      name: image.alt,
      ...(image.caption ? { caption: image.caption } : {}),
    })),
  };

  return (
    <>
      <JsonLd data={schema} />
      <PageHero
        eyebrow={`${album.category} · ${album.year}`}
        title={album.title}
        titleMr={album.titleMr}
        intro={album.description}
        breadcrumbs={[{ label: 'Gallery', href: '/gallery' }, { label: album.title }]}
        meta={(
          <p className="inline-flex items-center gap-2 text-sm font-medium text-ink/80">
            <AreaIcon name="camera" className="h-4 w-4 text-vermilion-600" />
            {album.count} {album.count === 1 ? 'photograph' : 'photographs'}. Select one to view it larger.
          </p>
        )}
      >
        {event && <Link href={`/events/${event.slug}`} className="btn btn-primary">About this event</Link>}
        {isSohala && <Link href="/gaurav-sohala" className="btn btn-primary">About the Gaurav Sohala</Link>}
        <Link href="/gallery" className="btn btn-outline">All albums</Link>
      </PageHero>

      <section className="container-page section-y !pb-0" aria-labelledby="album-photos-heading">
        <h2 id="album-photos-heading" className="sr-only">Photographs</h2>
        <GalleryGrid images={album.images} label={`${album.title} photographs`} />
      </section>

      <nav aria-label="More albums" className="container-page section-y !pb-0">
        <div className="grid gap-4 sm:grid-cols-2">
          {previous ? (
            <Link href={`/gallery/${previous.slug}`} className="card card-hover p-5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/65"><span aria-hidden="true">← </span>Previous album</span>
              <span className="mt-1 block font-display text-lg text-vermilion-700">{previous.title}</span>
            </Link>
          ) : <span />}
          {next && (
            <Link href={`/gallery/${next.slug}`} className="card card-hover p-5 sm:text-right">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/65">Next album<span aria-hidden="true"> →</span></span>
              <span className="mt-1 block font-display text-lg text-vermilion-700">{next.title}</span>
            </Link>
          )}
        </div>
      </nav>

      <CtaBanner />
    </>
  );
}
