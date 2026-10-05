import Link from 'next/link';
import PageHero from '../../../../components/PageHero';
import Reveal from '../../../../components/Reveal';
import AreaIcon from '../../../../components/AreaIcon';
import { BANK_DETAILS } from '../../../../lib/bankDetails';
import { buildMetadata } from '../../../../lib/seo';
import { TRUST } from '../../../../lib/siteData';

export const metadata = buildMetadata({
  title: 'Bank Transfer & Large Donations | Pune CKP Family Public Trust',
  description: 'Bank, IFSC and G-Pay details for donations above ₹10,000 to Pune CKP Family Public Trust, plus how to claim your official receipt after transferring.',
  path: '/donate/bank-transfer',
});

const ROWS = [
  ['Bank', BANK_DETAILS.bankName],
  ['Branch', BANK_DETAILS.branch],
  ['Account number', BANK_DETAILS.accountNumber],
  ['IFSC', BANK_DETAILS.ifsc],
  ['G-Pay', BANK_DETAILS.gpay],
  ['PAN', BANK_DETAILS.pan],
];

export default function BankTransferPage() {
  return (
    <>
      <PageHero
        eyebrow="For Donations"
        title="Bank transfer and large donations"
        intro="Use these details for donations above ₹10,000, or whenever you prefer a direct bank transfer or UPI over the online form."
        breadcrumbs={[{ label: 'Donate', href: '/donate' }, { label: 'Bank Transfer' }]}
      />

      <section className="container-page section-y">
        <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <Reveal variant="left" className="card overflow-hidden">
            <div className="motif-paithani" aria-hidden="true" />
            <div className="p-6 sm:p-8">
              <h2 className="h-card flex items-center gap-3"><AreaIcon name="bank" className="h-5 w-5" />Transfer details</h2>
              <dl className="mt-5 divide-y divide-saffron-200/70 font-mono text-sm text-ink/85">
                {ROWS.map(([label, value]) => (
                  <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3">
                    <dt className="text-ink/65">{label}</dt>
                    <dd className="font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-ink/65">Please check the details carefully before you transfer.</p>
            </div>
          </Reveal>

          <Reveal variant="right" className="flex flex-col gap-6">
            <div className="rounded-3xl border border-saffron-200 bg-cream-300/50 p-6 sm:p-7">
              <h2 className="h-card">After you transfer</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Please email <a href={`mailto:${TRUST.email}`} className="break-all font-semibold text-vermilion-700 underline underline-offset-4">{TRUST.email}</a> or
                call <a href={TRUST.phoneHref} className="font-semibold text-vermilion-700 underline underline-offset-4">{TRUST.phoneDisplay}</a> with your
                transaction reference. The trust will issue an official receipt.
              </p>
            </div>
            <div className="on-dark panel-vermilion rounded-3xl p-6 text-white sm:p-7">
              <h2 className="font-display text-xl text-saffron-300">Giving ₹10,000 or less?</h2>
              <p className="mt-2 text-sm leading-relaxed text-cream-200/90">Donate online and your PDF receipt is ready at once.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/donate" className="btn btn-sm btn-saffron">Donate online</Link>
                <Link href="/contact" className="btn btn-sm btn-light">Contact the trust</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
