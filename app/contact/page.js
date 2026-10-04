import { BANK_DETAILS } from '../../lib/bankDetails';
import { buildMetadata } from '../../lib/seo';

export const metadata = buildMetadata({
  title: 'Contact Us | Pune CKP Family Public Trust',
  description: 'Contact Pune CKP Family Public Trust in Kothrud, Pune — registered office address, phone, email, membership queries and bank details for donations.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <div className="container-page py-16 md:py-24">
      <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">Get in Touch</p>
      <h1 className="font-display text-4xl md:text-5xl text-center mt-3">Contact Us</h1>

      <div className="grid md:grid-cols-2 gap-8 mt-14 max-w-4xl mx-auto">
        <div className="bg-cream-100 border border-saffron-200 rounded-3xl p-8">
          <h2 className="font-display text-xl text-vermilion-700">Registered Office</h2>
          <p className="text-sm text-ink/70 mt-3 leading-relaxed">
            Pune CKP Family Public Trust<br />
            Survey No 129/26, 602 Niranka Co-op Housing Society,<br />
            Ideal Colony, Paud Road, Kothrud, Pune – 411038
          </p>
          <p className="text-sm text-ink/70 mt-4">Phone: 7447794477</p>
          <p className="text-sm text-ink/70">Email: puneckpfamily@gmail.com</p>
          <p className="text-sm text-ink/70 mt-4">Membership queries: Shri Nilesh Gupte — 8669151533</p>
        </div>

        <div className="bg-cream-100 border border-saffron-200 rounded-3xl p-8">
          <h2 className="font-display text-xl text-vermilion-700">Bank Transfer (for donations above ₹10,000)</h2>
          <dl className="mt-4 space-y-2 text-sm text-ink/70 font-mono">
            <div className="flex justify-between"><dt>Bank</dt><dd>{BANK_DETAILS.bankName}</dd></div>
            <div className="flex justify-between"><dt>Branch</dt><dd>{BANK_DETAILS.branch}</dd></div>
            <div className="flex justify-between"><dt>A/C No.</dt><dd>{BANK_DETAILS.accountNumber}</dd></div>
            <div className="flex justify-between"><dt>IFSC</dt><dd>{BANK_DETAILS.ifsc}</dd></div>
            <div className="flex justify-between"><dt>G-Pay</dt><dd>{BANK_DETAILS.gpay}</dd></div>
            <div className="flex justify-between"><dt>PAN</dt><dd>{BANK_DETAILS.pan}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}
