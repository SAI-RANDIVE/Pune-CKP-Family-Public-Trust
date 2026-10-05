import LegalPage from '../../../components/LegalPage';
import { buildMetadata } from '../../../lib/seo';

export const metadata = buildMetadata({
  title: 'Terms and Conditions | Pune CKP Family Public Trust',
  description: 'The terms governing donations, membership and use of the Pune CKP Family Public Trust website, including payment, liability and jurisdiction.',
  path: '/terms',
});

// Adapted from the trust's existing published terms. ⚠️ Have the trustees (and
// ideally a lawyer) review before this goes live — it is a binding document.
const SECTIONS = [
  {
    heading: 'Who these terms apply to',
    body: [
      'These terms govern your use of the Pune CKP Family Public Trust website and any donation or membership payment you make through it. By donating, joining or renewing, you accept them.',
      'Pune CKP Family Public Trust is a public trust registered under number E-8167, dated 14 May 2018, with PAN AADTP7440A, at 602 Niranka CHS, Ideal Society, Paud Road, Kothrud, Pune 411038.',
    ],
  },
  {
    heading: 'Donations and membership payments',
    body: [
      'You must provide accurate and complete information before donating or applying for membership. The trust relies on these details to issue a valid receipt and, where applicable, to register your membership.',
      'Online donations are accepted between ₹100 and ₹10,000 per transaction. Larger donations should be made by bank transfer or UPI using the details on the Bank Transfer page.',
      'Membership fees, validity periods and the one-time form fee are as set out on the Membership page at the time you pay. Payment does not by itself confer membership until it has been confirmed and recorded by the trust.',
    ],
  },
  {
    heading: 'Payment processing',
    body: [
      'Payments are processed by Razorpay, a third-party payment gateway. The trust does not receive or store your card, UPI or net-banking credentials.',
      'The trust is not responsible for failures, delays or errors originating with the payment gateway, your bank or your card issuer. If money is debited but you do not receive a receipt, contact the trust with your payment reference and it will be reconciled.',
    ],
  },
  {
    heading: 'Receipts and tax certificates',
    body: [
      'An official receipt is generated for every confirmed payment, carrying a unique receipt number, the trust’s registration number and its PAN.',
      'Where a tax exemption certificate can be issued, the trust will provide it within a reasonable period. Contact the trust before donating if a certificate is essential to your decision.',
    ],
  },
  {
    heading: 'Your responsibilities',
    body: [
      'You are responsible for the accuracy of the information you submit and for any activity carried out using your details. Tell the trust promptly if you believe your membership details have been misused.',
    ],
  },
  {
    heading: 'Limitation of liability',
    body: [
      'The trust takes reasonable steps to keep the information you provide secure, but accepts no liability for indirect or consequential loss arising from disclosure of personal data, or from circumstances outside its reasonable control.',
    ],
  },
  {
    heading: 'Governing law and jurisdiction',
    body: [
      'These terms are governed by the laws of India. The courts at Pune have exclusive jurisdiction over any dispute.',
      'Any dispute that cannot be resolved between the parties may be referred to arbitration under the Arbitration and Conciliation Act, 1996.',
    ],
  },
  {
    heading: 'Changes to these terms',
    body: [
      'The trust may update these terms from time to time. Changes take effect when published on this page, so please review it periodically.',
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      label="Legal"
      title="Terms and Conditions"
      breadcrumbLabel="Terms"
      intro="The terms on which the trust accepts donations and membership through this website."
      updated="September 2026"
      sections={SECTIONS}
    />
  );
}
