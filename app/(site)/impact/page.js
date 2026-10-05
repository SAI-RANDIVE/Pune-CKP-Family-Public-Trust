import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import SectionHeading from '../../../components/SectionHeading';
import Reveal, { Stagger } from '../../../components/Reveal';
import StatsSection from '../../../components/StatsSection';
import Testimonials from '../../../components/Testimonials';
import GalleryGrid from '../../../components/GalleryGrid';
import CtaBanner from '../../../components/CtaBanner';
import { buildMetadata } from '../../../lib/seo';
import { DONATIONS_LEDGER, COMPUTER_DONATIONS, RELIEF_WORK, CONTRIBUTION_TOTAL } from '../../../lib/impactData';
import { findImage } from '../../../lib/galleryData';

export const metadata = buildMetadata({
  title: 'Donations & Impact | Pune CKP Family Public Trust',
  description: 'Where the trust’s support has gone: contributions by cause, the organisations it has funded, computers for rural schools, and relief work in floods and the pandemic.',
  path: '/impact',
});

const PHOTO_PICKS = [
  ['ckp-sanmaan-sohala', 'QMTI-Khadki'],
  ['ckp-sanmaan-sohala', 'Bhise-Vrudhashram'],
  ['ckp-sanmaan-sohala', 'Anandwan'],
  ['album-2019', 'Ekvira-Devasthan'],
  ['album-2019', 'Matoshree-Old-age-home1'],
  ['album-2020', 'Samparc-a-organisation-of-300-students-food-grain-Donation2'],
  ['album-2020', 'Aai-old-age-home'],
  ['album-2020', 'Safety-kit-distribution-at-various-Police-stations-in-Pune-During-Covid19_1'],
];

const formatRupees = (amount) => `₹${amount.toLocaleString('en-IN')}`;

export default function ImpactPage() {
  const photos = PHOTO_PICKS.map(([slug, file]) => findImage(slug, file)).filter(Boolean);

  return (
    <>
      <PageHero
        eyebrow="Donations & Contributions"
        title="Where the support has gone"
        intro={`The donations and contributions made by the trust for various important causes: more than ₹${Math.floor(CONTRIBUTION_TOTAL / 100000)} lakh in all, by cause and by the organisations that received it.`}
        breadcrumbs={[{ label: 'Donations & Impact' }]}
      >
        <Link href="/donate" className="btn btn-primary">Add to this work</Link>
        <Link href="/projects" className="btn btn-outline">See the projects</Link>
      </PageHero>

      <StatsSection heading={false} />

      {/* Ledger */}
      <section className="border-y border-saffron-200 bg-white/60" aria-labelledby="ledger-heading">
        <div className="container-page section-y">
          <SectionHeading
            id="ledger-heading"
            eyebrow="By recipient"
            title="Organisations and causes supported"
            intro="The recipient-wise list the trust published in 2021. It covers part of the totals above; amounts are shown where the trust has stated them consistently."
          />

          {/* Cards on phones, a table from md up: same data, no horizontal scroll */}
          <Stagger as="ul" className="mt-10 grid gap-4 md:hidden">
            {DONATIONS_LEDGER.map((row) => (
              <li key={row.recipient} className="card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-saffron-800">{row.area}</p>
                <p className="mt-1 font-display text-lg leading-snug text-ink">{row.recipient}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink/75">{row.purpose}</p>
                <p className="mt-3 font-mono text-base font-semibold text-vermilion-700">{row.amount ? formatRupees(row.amount) : row.amountText}</p>
              </li>
            ))}
          </Stagger>

          <Reveal className="card mt-10 hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Donations and contributions by recipient</caption>
              <thead className="bg-cream-300/70 text-xs uppercase tracking-wide text-ink/75">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold">Recipient</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Purpose</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Field</th>
                  <th scope="col" className="px-6 py-4 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-saffron-200/70">
                {DONATIONS_LEDGER.map((row) => (
                  <tr key={row.recipient} className="row-hover">
                    <th scope="row" className="px-6 py-4 font-semibold text-ink">{row.recipient}</th>
                    <td className="px-6 py-4 text-ink/75">{row.purpose}</td>
                    <td className="px-6 py-4 text-ink/75">{row.area}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-mono font-semibold text-vermilion-700">{row.amount ? formatRupees(row.amount) : row.amountText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      {/* Computers */}
      <section className="container-page section-y scroll-mt-24" id="computers" aria-labelledby="computers-heading">
        <SectionHeading
          id="computers-heading"
          eyebrow="Education"
          title="Computers for schools, in the pandemic"
          intro="For the computerisation of schools during the Corona pandemic, so that needy schools in rural areas could hold online classes."
        />
        <Stagger as="ul" className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMPUTER_DONATIONS.map((row) => (
            <li key={row.recipient} className="card flex gap-4 p-5">
              <span className="flex h-12 shrink-0 items-center rounded-xl bg-saffron-100 px-3 text-center font-display text-sm leading-tight text-saffron-900">{row.items}</span>
              <span>
                <span className="block text-sm font-semibold leading-snug text-ink">{row.recipient}</span>
                {row.recipientMr && <span className="devanagari mt-0.5 block text-xs text-ink/65" lang="mr">{row.recipientMr}</span>}
              </span>
            </li>
          ))}
        </Stagger>
      </section>

      {/* Relief */}
      <section className="border-y border-saffron-200 bg-cream-300/50" aria-labelledby="relief-heading">
        <div className="container-page section-y">
          <SectionHeading id="relief-heading" eyebrow="Relief and welfare" title="Help that does not fit in a table" />
          <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {RELIEF_WORK.map((item) => (
              <article key={item.title} className="card p-6">
                <h3 className="h-card">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/75">{item.text}</p>
              </article>
            ))}
          </Stagger>
          <Reveal className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/events/covid-19-relief" className="btn btn-outline">COVID-19 relief work</Link>
            <Link href="/projects/mahad-ram-mandir" className="btn btn-outline">Mahad flood relief</Link>
          </Reveal>
        </div>
      </section>

      {photos.length > 0 && (
        <section className="container-page section-y" aria-labelledby="impact-photos-heading">
          <SectionHeading id="impact-photos-heading" eyebrow="On record" title="Donations in pictures" />
          <div className="mt-10">
            <GalleryGrid images={photos} label="Donation photographs" />
          </div>
        </section>
      )}

      <div className="border-t border-saffron-200 bg-white/60">
        <Testimonials />
      </div>

      <CtaBanner />
    </>
  );
}
