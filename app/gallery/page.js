import Image from 'next/image';
import Link from 'next/link';
import Breadcrumbs from '../../components/Breadcrumbs';
import { buildMetadata } from '../../lib/seo';

export const metadata = buildMetadata({
  title: 'Gallery | Pune CKP Family Public Trust',
  description: 'Photographs of Pune CKP Family Public Trust — the community, its service work and the annual CKP Gaurav Sohala felicitation ceremonies held since 2018.',
  path: '/gallery',
});

// TODO: alt text — these are placeholder images. Replace with real Trust photographs
// and give each item a descriptive `alt` written for the photo it actually shows.
const GALLERY_ITEMS = [
  { title: 'Trust Identity', image: 'https://picsum.photos/seed/pune-ckp-trust/900/900', note: 'The trust’s emblem and community identity.' },
  { title: 'Gaurav Sohala 2018', image: 'https://picsum.photos/seed/ckp-gaurav-2018/900/900', note: 'The first community felicitation event.' },
  { title: 'Gaurav Sohala 2019', image: 'https://picsum.photos/seed/ckp-gaurav-2019/900/900', note: 'A Republic Day celebration with patriotic fervour.' },
  { title: 'Relief & Service', image: 'https://picsum.photos/seed/ckp-relief/900/900', note: 'Support during medical and disaster-response work.' },
  { title: 'Education Support', image: 'https://picsum.photos/seed/ckp-education/900/900', note: 'Books, scholarships and student upliftment.' },
  { title: 'Community Gatherings', image: 'https://picsum.photos/seed/ckp-community/900/900', note: 'Celebrations that bring the family together.' },
];

export default function GalleryPage() {
  return (
    <div className="container-page py-16 md:py-24">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Gallery' }]} />
      <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">Our Gallery</p>
      <h1 className="font-display text-4xl md:text-5xl text-center mt-3">The CKP family in focus</h1>
      <p className="max-w-2xl mx-auto mt-5 text-center text-ink/70 leading-relaxed">A growing visual record of the trust, its people and its work across the community.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 mt-14 max-w-5xl mx-auto">
        {GALLERY_ITEMS.map((item) => (
          <figure key={item.title} className="soft-card bg-cream-100 border border-saffron-200/70 rounded-2xl p-5">
            <div className="aspect-square rounded-xl overflow-hidden bg-cream-300">
              <Image src={item.image} alt={item.title} width={900} height={900} className="h-full w-full object-cover" />
            </div>
            <figcaption className="font-display text-lg text-vermilion-700 mt-4">{item.title}</figcaption>
            <p className="text-sm text-ink/70 mt-1">{item.note}</p>
          </figure>
        ))}
        <div className="sm:col-span-2 bg-cream-300/60 border border-saffron-200 rounded-2xl p-8 flex flex-col justify-center soft-card">
          <h2 className="font-display text-2xl text-vermilion-700">More memories coming soon</h2>
          <p className="text-sm text-ink/70 mt-3 leading-relaxed">Community and event photographs can be added to the gallery as they become available. The page is ready for Gaurav Sohala, education, medical and social-work albums.</p>
          <Link href="/gaurav-sohala" className="inline-block mt-5 text-sm font-semibold text-vermilion-600 hover:text-vermilion-700">Explore Gaurav Sohala history →</Link>
        </div>
      </div>

      <div className="mt-14 text-center">
        <Link href="/donate" className="rounded-full bg-vermilion-500 text-cream-100 px-6 py-3 font-semibold hover:bg-vermilion-600 transition-colors">Support the work</Link>
        <Link href="/contact" className="ml-3 rounded-full border-2 border-vermilion-500 text-vermilion-600 px-6 py-3 font-semibold hover:bg-vermilion-50 transition-colors">Share a photograph</Link>
      </div>
    </div>
  );
}
