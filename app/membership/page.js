import MembershipForm from '../../components/MembershipForm';
import { buildMetadata } from '../../lib/seo';

export const metadata = buildMetadata({
  title: 'Membership | Pune CKP Family Public Trust',
  description: 'Join Pune CKP Family Public Trust as a Silver, Gold or Platinum member. Compare tiers, see fees and validity, and complete your membership online.',
  path: '/membership',
});

export default function MembershipPage() {
  return (
    <div className="container-page py-16 md:py-24">
      <p className="devanagari text-base font-semibold tracking-[0.15em] text-vermilion-600 text-center">नवीन सदस्यत्व</p>
      <h1 className="font-display text-4xl md:text-5xl text-center mt-3">Become a Member</h1>
      <p className="text-center text-ink/70 max-w-xl mx-auto mt-4 leading-relaxed">
        Choose a tier below, fill in your details, and pay securely online. Your membership
        receipt (PDF) is generated automatically the moment your payment is confirmed.
      </p>

      <div className="mt-14">
        <MembershipForm />
      </div>

      <div className="max-w-2xl mx-auto mt-14 text-xs text-ink/50 leading-relaxed border-t border-saffron-200 pt-6">
        <p>
          Silver membership pricing effective 1 September 2024: a first-time Silver membership
          runs to the next 30 June or 31 December that is at least 12 months away, billed at
          ₹1,000/year (prorated) plus a one-time ₹100 registration fee. Renewals are a flat
          ₹1,000 for one year. Gold membership is ₹5,000 for 5 years, and Platinum is a one-time
          ₹10,000 lifetime membership.
        </p>
      </div>
    </div>
  );
}
