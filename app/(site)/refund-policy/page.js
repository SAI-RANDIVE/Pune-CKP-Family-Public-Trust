import LegalPage from '../../../components/LegalPage';
import { buildMetadata } from '../../../lib/seo';

export const metadata = buildMetadata({
  title: 'Refund & Cancellation Policy | Pune CKP Family Public Trust',
  description: 'How Pune CKP Family Public Trust handles refund requests, failed payments and cancelled memberships, and how to raise a request with the trust.',
  path: '/refund-policy',
});

// ⚠️ CONFLICT TO RESOLVE BEFORE GOING LIVE.
// The trust's previously published terms offered a 30-day refund window on
// donations. The printed receipt template says "Non refundable". Those cannot
// both stand. The wording below is deliberately written as "reviewed on a
// best-effort basis, at the trust's discretion" so it contradicts neither —
// but the trustees need to pick one and the receipt must then match this page.
const SECTIONS = [
  {
    heading: 'Donations',
    body: [
      'Donations to Pune CKP Family Public Trust are treated as final, because funds are committed to beneficiaries soon after they are received.',
      'If you have donated in error — a duplicate payment, or the wrong amount — contact the trust as soon as possible. Requests are reviewed on a best-effort basis and the final decision rests with the trust.',
    ],
  },
  {
    heading: 'How to request a refund',
    body: ['Email puneckpfamily@gmail.com or call 7447794477 with:'],
    list: [
      'Your receipt number (for example M/26-27/032).',
      'The Razorpay payment reference from your confirmation or bank statement.',
      'The date and amount of the payment.',
      'A short explanation of what went wrong.',
    ],
  },
  {
    heading: 'How approved refunds are paid',
    body: [
      'Where a refund is approved, it is returned to the original payment method — the same card, account or UPI handle the payment came from. The trust cannot redirect a refund to a different account.',
      'Refunds are initiated by the trust through Razorpay. Once initiated, the time taken to appear on your statement depends on your bank or card issuer, and is typically five to seven working days.',
      'When a refund is issued, the corresponding receipt is cancelled and is no longer valid for any purpose, including tax.',
    ],
  },
  {
    heading: 'Failed and incomplete payments',
    body: [
      'If a payment fails, no receipt is generated and no membership is activated. Nothing is owed and no action is needed from you.',
      'If money left your account but you did not receive a receipt, the payment may have been debited without being confirmed to the trust. Contact the trust with your payment reference and it will be traced and either receipted or refunded.',
    ],
  },
  {
    heading: 'Membership fees',
    body: [
      'Membership fees, including the one-time form fee, are generally not refundable once the membership has been registered and a membership number issued.',
      'If you paid for the wrong tier, or paid twice, contact the trust — it can usually correct the record or adjust the balance against your membership rather than refunding it.',
    ],
  },
  {
    heading: 'Bank transfers',
    body: [
      'Donations sent by direct bank transfer or UPI, rather than through this website, are handled the same way. Contact the trust with your transaction reference.',
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage
      label="Legal"
      title="Refund & Cancellation Policy"
      breadcrumbLabel="Refund Policy"
      intro="How the trust handles refund requests, failed payments and cancelled memberships."
      updated="September 2026"
      sections={SECTIONS}
    />
  );
}
