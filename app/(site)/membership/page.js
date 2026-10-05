import Link from 'next/link';
import MembershipForm from '../../../components/MembershipForm';
import PageHero from '../../../components/PageHero';
import Reveal, { Stagger } from '../../../components/Reveal';
import AreaIcon from '../../../components/AreaIcon';
import { buildMetadata } from '../../../lib/seo';
import { TRUST } from '../../../lib/siteData';

export const metadata = buildMetadata({
  title: 'Membership | Pune CKP Family Public Trust',
  description: 'Join Pune CKP Family Public Trust as a Silver, Gold or Platinum member. Compare tiers, see fees and validity, and complete your membership online.',
  path: '/membership',
});

// What the trust's own FAQ says membership brings. Fees are the current ones.
const BENEFITS = [
  { icon: 'users', title: 'Part of the family', text: 'Monthly meetings, festivals and get-togethers of the Pune CKP Family.' },
  { icon: 'heart', title: 'There in an emergency', text: 'Interest-free medical loans of up to ₹25,000 for members facing treatment costs.' },
  { icon: 'medal', title: 'A seat at the Sohala', text: 'An invitation to the annual Gaurav Sohala and to the trust’s cultural and sporting events.' },
];

export default function MembershipPage() {
  return (
    <>
      <PageHero
        eyebrow="Membership"
        title="Become a member"
        titleMr="नवीन सदस्यत्व"
        intro="Choose a tier below, fill in your details, and pay securely online. Your membership receipt (PDF) is generated automatically the moment your payment is confirmed."
        breadcrumbs={[{ label: 'Membership' }]}
      />

      <section className="container-page section-y !pb-0" aria-labelledby="benefits-heading">
        <h2 id="benefits-heading" className="sr-only">What membership brings</h2>
        <Stagger as="ul" className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
          {BENEFITS.map((item) => (
            <li key={item.title} className="card flex items-start gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-vermilion-50 text-vermilion-700"><AreaIcon name={item.icon} className="h-5 w-5" /></span>
              <span>
                <span className="block text-sm font-semibold text-ink">{item.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-ink/75">{item.text}</span>
              </span>
            </li>
          ))}
        </Stagger>
      </section>

      <section className="container-page py-12 md:py-16" aria-labelledby="membership-form-heading">
        <h2 id="membership-form-heading" className="sr-only">Choose a tier and join</h2>
        <MembershipForm />

        <Reveal className="mx-auto mt-12 max-w-3xl rounded-3xl border border-saffron-200 bg-cream-300/50 p-6 text-sm leading-relaxed text-ink/75 sm:p-7">
          <h2 className="h-card">How the fees work</h2>
          <p className="mt-3">
            Silver membership pricing effective 1 September 2024: a first-time Silver membership
            runs to the next 30 June or 31 December that is at least 12 months away, billed at
            ₹1,000/year (prorated) plus a one-time ₹100 registration fee. Renewals are a flat
            ₹1,000 for one year. Gold membership is ₹5,000 for 5 years, and Platinum is a one-time
            ₹10,000 lifetime membership.
          </p>
          <p className="mt-3">
            Questions about membership? Call {TRUST.membershipContact.name} on{' '}
            <a href={TRUST.membershipContact.phoneHref} className="font-semibold text-vermilion-700 underline underline-offset-4">{TRUST.membershipContact.phoneDisplay}</a>{' '}
            or read the <Link href="/faq#membership" className="font-semibold text-vermilion-700 underline underline-offset-4">membership FAQ</Link>.
          </p>
        </Reveal>
      </section>
    </>
  );
}
