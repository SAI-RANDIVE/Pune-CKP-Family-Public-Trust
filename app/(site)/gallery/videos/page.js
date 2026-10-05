import Link from 'next/link';
import PageHero from '../../../../components/PageHero';
import { Stagger } from '../../../../components/Reveal';
import { VideoCard } from '../../../../components/Cards';
import CtaBanner from '../../../../components/CtaBanner';
import JsonLd from '../../../../components/JsonLd';
import { buildMetadata, getSiteUrl } from '../../../../lib/seo';
import { VIDEOS, VIDEO_CATEGORIES } from '../../../../lib/galleryData';
import { TRUST } from '../../../../lib/siteData';

export const metadata = buildMetadata({
  title: 'Video Gallery | Pune CKP Family Public Trust',
  description: 'Videos from Pune CKP Family Public Trust: Gaurav Sohala films, music programmes, the Sahitya Dindi, the CKP Dhurandhar picture series and relief work.',
  path: '/gallery/videos',
});

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function VideoGalleryPage() {
  const youtube = TRUST.social.find((item) => item.label === 'YouTube');
  const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Video gallery of Pune CKP Family Public Trust',
    url: `${getSiteUrl()}/gallery/videos`,
    numberOfItems: VIDEOS.length,
    itemListElement: VIDEOS.map((video, i) => ({ '@type': 'ListItem', position: i + 1, name: video.title, url: video.url })),
  };

  return (
    <>
      <JsonLd data={listSchema} />
      <PageHero
        eyebrow="Video Gallery"
        title="Watch the trust at work and at play"
        intro={`${VIDEOS.length} videos: ceremonies, music programmes, literary events and relief work. Each one opens on YouTube.`}
        breadcrumbs={[{ label: 'Gallery', href: '/gallery' }, { label: 'Videos' }]}
      >
        {youtube && <a href={youtube.href} target="_blank" rel="noopener noreferrer" className="btn btn-primary">The trust on YouTube <span className="sr-only">(opens in a new tab)</span></a>}
        <Link href="/gallery" className="btn btn-outline">Photo albums</Link>
      </PageHero>

      <div className="container-page section-y !pb-0">
        {VIDEO_CATEGORIES.map((category, groupIndex) => {
          const id = slugify(category);
          const videos = VIDEOS.filter((video) => video.category === category);
          return (
            <section key={category} id={id} aria-labelledby={`${id}-heading`} className={groupIndex === 0 ? '' : 'mt-14'}>
              <h2 id={`${id}-heading`} className="flex items-center gap-4 font-display text-2xl text-vermilion-700 md:text-3xl">
                {category}
                <span className="h-px flex-1 bg-gradient-to-r from-saffron-400 to-transparent" aria-hidden="true" />
              </h2>
              <Stagger className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {videos.map((video) => <VideoCard key={video.id} video={video} />)}
              </Stagger>
            </section>
          );
        })}
      </div>

      <CtaBanner />
    </>
  );
}
