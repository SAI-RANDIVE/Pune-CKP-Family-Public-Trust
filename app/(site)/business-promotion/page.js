import Link from 'next/link';
import Image from 'next/image';
import PageHero from '../../../components/PageHero';
import Reveal, { Stagger } from '../../../components/Reveal';
import CtaBanner from '../../../components/CtaBanner';
import { buildMetadata } from '../../../lib/seo';
import { MEMBER_BUSINESSES } from '../../../lib/teamData';
import { siteImage } from '../../../lib/galleryData';
import { TRUST } from '../../../lib/siteData';

export const metadata = buildMetadata({
  title: 'Business Promotion | Pune CKP Family Public Trust',
  description: 'Businesses and services promoted by Pune CKP Family Public Trust on behalf of its community: Lagnagath, Ojaskara, Patankar, Vaidya, Ashmo, Reshimgathi and Aarogyam.',
  path: '/business-promotion',
});

export default function BusinessPromotionPage() {
  const businesses = MEMBER_BUSINESSES.map((b) => ({ ...b, src: siteImage('business', b.logo) }));

  return (
    <>
      <PageHero
        eyebrow="Business Promotion"
        title="Businesses from the community"
        intro="One of the trust’s activities is to give the businesses of the community a place to be seen. These are the ones it has promoted."
        breadcrumbs={[{ label: 'About the Trust', href: '/about' }, { label: 'Business Promotion' }]}
      />

      <section className="container-page section-y" aria-labelledby="businesses-heading">
        <h2 id="businesses-heading" className="sr-only">Promoted businesses</h2>
        <Stagger as="ul" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((business) => (
            <li key={business.name} className="card card-hover overflow-hidden">
              <div className="relative aspect-[4/3] bg-white">
                {business.src ? (
                  <a href={business.src} target="_blank" rel="noopener noreferrer" aria-label={`Open the ${business.name} advertisement at full size (opens in a new tab)`} className="absolute inset-0 block">
                    <Image src={business.src} alt={`Advertisement for ${business.name}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px" className="object-contain p-3" />
                  </a>
                ) : (
                  <span className="flex h-full items-center justify-center font-display text-3xl text-vermilion-700">{business.name}</span>
                )}
              </div>
              <h3 className="border-t border-saffron-200 px-5 py-4 font-display text-lg text-ink">{business.name}</h3>
            </li>
          ))}
        </Stagger>

        <Reveal className="mx-auto mt-12 max-w-2xl rounded-3xl border border-saffron-200 bg-cream-300/50 p-6 text-center sm:p-8">
          <h2 className="h-card">Questions about this page?</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink/75">
            Call the trust on <a href={TRUST.phoneHref} className="font-semibold text-vermilion-700 underline underline-offset-4">{TRUST.phoneDisplay}</a> or
            write to <a href={`mailto:${TRUST.email}`} className="break-all font-semibold text-vermilion-700 underline underline-offset-4">{TRUST.email}</a>.
          </p>
          <p className="mt-5"><Link href="/contact" className="btn btn-outline">Contact the trust</Link></p>
        </Reveal>
      </section>

      <CtaBanner />
    </>
  );
}
