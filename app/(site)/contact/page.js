import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import Reveal, { Stagger } from '../../../components/Reveal';
import AreaIcon from '../../../components/AreaIcon';
import JsonLd from '../../../components/JsonLd';
import { BANK_DETAILS } from '../../../lib/bankDetails';
import { buildMetadata, getSiteUrl } from '../../../lib/seo';
import { TRUST } from '../../../lib/siteData';

export const metadata = buildMetadata({
  title: 'Contact Us | Pune CKP Family Public Trust',
  description: 'Contact Pune CKP Family Public Trust in Kothrud, Pune: office address, phone, email, the membership contact, and bank details for donations.',
  path: '/contact',
});

export default function ContactPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    url: `${getSiteUrl()}/contact`,
    name: `Contact ${TRUST.name}`,
    about: { '@id': `${getSiteUrl()}/#organization` },
  };

  const mapQuery = encodeURIComponent('602 Niranka Co-op Housing Society, Ideal Colony, Paud Road, Kothrud, Pune 411038');

  return (
    <>
      <JsonLd data={schema} />
      <PageHero
        eyebrow="Get in Touch"
        title="Contact the trust"
        intro="For membership, donations, help for someone in need, or anything else: call or write to us."
        breadcrumbs={[{ label: 'Contact' }]}
      />

      <section className="container-page section-y !pb-0" aria-labelledby="reach-heading">
        <h2 id="reach-heading" className="sr-only">Ways to reach us</h2>
        <Stagger className="grid gap-5 md:grid-cols-3">
          <a href={TRUST.phoneHref} className="card card-hover flex flex-col p-6 sm:p-7">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-vermilion-50 text-vermilion-700"><AreaIcon name="phone" /></span>
            <span className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink/65">Call the trust</span>
            <span className="mt-1 font-display text-2xl text-vermilion-700">{TRUST.phoneDisplay}</span>
            <span className="mt-2 text-sm text-ink/75">The same number is used for G-Pay.</span>
          </a>
          <a href={`mailto:${TRUST.email}`} className="card card-hover flex flex-col p-6 sm:p-7">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-vermilion-50 text-vermilion-700"><AreaIcon name="mail" /></span>
            <span className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink/65">Write to us</span>
            <span className="mt-1 break-all font-display text-xl text-vermilion-700">{TRUST.email}</span>
            <span className="mt-2 text-sm text-ink/75">Include your receipt or membership number if you have one.</span>
          </a>
          <a href={TRUST.membershipContact.phoneHref} className="card card-hover flex flex-col p-6 sm:p-7">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-vermilion-50 text-vermilion-700"><AreaIcon name="users" /></span>
            <span className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink/65">Membership</span>
            <span className="mt-1 font-display text-2xl text-vermilion-700">{TRUST.membershipContact.phoneDisplay}</span>
            <span className="mt-2 text-sm text-ink/75">{TRUST.membershipContact.name}, {TRUST.membershipContact.role}.</span>
          </a>
        </Stagger>
      </section>

      <section className="container-page section-y">
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal variant="left" className="card overflow-hidden">
            <div className="motif-paithani" aria-hidden="true" />
            <div className="p-6 sm:p-8">
              <h2 className="h-card flex items-center gap-3"><AreaIcon name="pin" className="h-5 w-5" />Office address</h2>
              <address className="mt-4 text-[0.95rem] not-italic leading-relaxed text-ink/80">
                <span className="block font-semibold text-ink">{TRUST.name}</span>
                <span className="devanagari block text-sm text-ink/70" lang="mr">{TRUST.nameMr}</span>
                {TRUST.addressLines.map((line) => <span key={line} className="mt-1 block">{line}</span>)}
              </address>
              <dl className="mt-5 grid gap-3 border-t border-saffron-200 pt-5 text-sm sm:grid-cols-2">
                <div><dt className="text-xs uppercase tracking-wide text-ink/65">Registration</dt><dd className="mt-0.5 font-mono font-semibold text-ink">{TRUST.regNo}, {TRUST.regDate}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-ink/65">PAN</dt><dd className="mt-0.5 font-mono font-semibold text-ink">{TRUST.pan}</dd></div>
              </dl>
              <p className="mt-6">
                <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">
                  Open in Google Maps <span className="sr-only">(opens in a new tab)</span>
                </a>
              </p>
            </div>
          </Reveal>

          <Reveal variant="right" className="card overflow-hidden">
            <div className="motif-paithani" aria-hidden="true" />
            <div className="p-6 sm:p-8">
              <h2 className="h-card flex items-center gap-3"><AreaIcon name="bank" className="h-5 w-5" />Bank details for donations</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/75">Use these for donations above ₹10,000, or whenever you prefer a direct transfer. Smaller donations can be made online in a minute.</p>
              <dl className="mt-5 divide-y divide-saffron-200/70 font-mono text-sm text-ink/85">
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5"><dt className="text-ink/65">Bank</dt><dd className="font-semibold">{BANK_DETAILS.bankName}</dd></div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5"><dt className="text-ink/65">Branch</dt><dd className="font-semibold">{BANK_DETAILS.branch}</dd></div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5"><dt className="text-ink/65">A/C No.</dt><dd className="font-semibold">{BANK_DETAILS.accountNumber}</dd></div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5"><dt className="text-ink/65">IFSC</dt><dd className="font-semibold">{BANK_DETAILS.ifsc}</dd></div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5"><dt className="text-ink/65">G-Pay</dt><dd className="font-semibold">{BANK_DETAILS.gpay}</dd></div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5"><dt className="text-ink/65">PAN</dt><dd className="font-semibold">{BANK_DETAILS.pan}</dd></div>
              </dl>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/donate" className="btn btn-sm btn-primary">Donate online</Link>
                <Link href="/donate/bank-transfer" className="btn btn-sm btn-outline">After you transfer</Link>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal className="mt-8 flex flex-col items-center justify-between gap-4 rounded-3xl border border-saffron-200 bg-cream-300/50 px-6 py-5 text-center md:flex-row md:text-left">
          <p className="text-sm leading-relaxed text-ink/80">Looking for a quick answer on receipts, refunds or renewing your membership?</p>
          <Link href="/faq" className="btn btn-sm btn-outline shrink-0">Read the FAQ</Link>
        </Reveal>
      </section>
    </>
  );
}
