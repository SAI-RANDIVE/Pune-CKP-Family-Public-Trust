import LegalPage from '../../components/LegalPage';
import { buildMetadata } from '../../lib/seo';

export const metadata = buildMetadata({
  title: 'Privacy Policy | Pune CKP Family Public Trust',
  description: 'How Pune CKP Family Public Trust collects, uses, stores and protects the personal details of donors and members, and how to request changes.',
  path: '/privacy',
});

// ⚠️ Review with the trustees. This describes what the site's code actually
// does today — if data handling changes, this page must change with it.
const SECTIONS = [
  {
    heading: 'What this policy covers',
    body: [
      'This policy explains what personal information Pune CKP Family Public Trust collects through this website, why it collects it, and what it does with it.',
    ],
  },
  {
    heading: 'What the trust collects',
    body: ['When you donate or apply for membership, the trust collects:'],
    list: [
      'Your name, postal address, phone number and email address — required, because they are printed on your official receipt.',
      'For membership: optionally your PAN number, blood group, date of birth and anniversary date.',
      'Payment references returned by Razorpay, including the order and payment identifiers, so the payment can be reconciled against your receipt.',
    ],
  },
  {
    heading: 'What the trust does not collect',
    body: [
      'The trust never receives or stores your card number, CVV, UPI PIN or net-banking credentials. Those are handled entirely by Razorpay on its own secure checkout.',
    ],
  },
  {
    heading: 'Why the trust holds this information',
    body: ['Your details are used only to:'],
    list: [
      'Issue and re-issue your official receipt.',
      'Register, renew and administer your membership.',
      'Reconcile payments and maintain the trust’s financial records, as required of a registered public trust.',
      'Contact you about your donation, membership or a query you have raised.',
    ],
  },
  {
    heading: 'Who it is shared with',
    body: [
      'The trust does not sell, rent or trade your personal information.',
      'It is shared only with Razorpay, to the extent needed to process your payment, and with the trust’s own trustees, staff and auditors for administration and statutory audit. It may also be disclosed where the law requires it.',
    ],
  },
  {
    heading: 'How long it is kept',
    body: [
      'Donation and membership records, including receipts, are retained for as long as the trust is required to keep its financial records, and so that a member’s history remains complete and auditable.',
    ],
  },
  {
    heading: 'Your choices',
    body: [
      'You can ask to see, correct or update the personal details the trust holds about you. Email puneckpfamily@gmail.com or call 7447794477 with your receipt or membership number.',
      'Some information cannot be deleted on request, because the trust is obliged to retain a record of payments it has received and receipts it has issued.',
    ],
  },
  {
    heading: 'Security',
    body: [
      'The trust takes reasonable technical and organisational steps to protect the information you provide. No system can be guaranteed completely secure, and the trust cannot accept liability for indirect loss arising from a breach outside its reasonable control.',
    ],
  },
  {
    heading: 'Changes to this policy',
    body: [
      'This policy may be updated from time to time. Any change takes effect when published on this page.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      label="Legal"
      title="Privacy Policy"
      breadcrumbLabel="Privacy"
      intro="What the trust collects about donors and members, why, and what it does with it."
      updated="September 2026"
      sections={SECTIONS}
    />
  );
}
