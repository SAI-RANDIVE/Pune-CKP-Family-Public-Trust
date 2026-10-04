import Link from 'next/link';
import Breadcrumbs from '../../../components/Breadcrumbs';
import { BANK_DETAILS } from '../../../lib/bankDetails';
import { buildMetadata } from '../../../lib/seo';

export const metadata = buildMetadata({
  title: 'Bank Transfer & Donations | Pune CKP Family Public Trust',
  description: 'Bank, IFSC and G-Pay details for donations above ₹10,000 to Pune CKP Family Public Trust, plus how to claim your official receipt after transferring.',
  path: '/donate/bank-transfer',
});

export default function BankTransferPage() {
  return (
    <div className="container-page py-16 md:py-24">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Donate', href: '/donate' }, { label: 'Bank Transfer' }]} />
      <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">For Donations</p>
      <h1 className="font-display text-4xl md:text-5xl text-center mt-3">Bank Transfer &amp; Large Donations</h1>
      <p className="max-w-2xl mx-auto mt-5 text-center text-ink/70 leading-relaxed">Use these details for donations above ₹10,000, or whenever you prefer a direct bank transfer or UPI over the online form.</p>

      <div className="max-w-2xl mx-auto mt-12 bg-cream-100 border border-saffron-200 rounded-2xl p-7 md:p-9">
        <h2 className="font-display text-2xl text-vermilion-700">Transfer details</h2>
        <dl className="mt-6 space-y-3 text-sm text-ink/75 font-mono">
          <div className="flex flex-wrap justify-between gap-3"><dt>Bank</dt><dd>{BANK_DETAILS.bankName}</dd></div>
          <div className="flex flex-wrap justify-between gap-3"><dt>Branch</dt><dd>{BANK_DETAILS.branch}</dd></div>
          <div className="flex flex-wrap justify-between gap-3"><dt>Account number</dt><dd>{BANK_DETAILS.accountNumber}</dd></div>
          <div className="flex flex-wrap justify-between gap-3"><dt>IFSC</dt><dd>{BANK_DETAILS.ifsc}</dd></div>
          <div className="flex flex-wrap justify-between gap-3"><dt>G-Pay</dt><dd>{BANK_DETAILS.gpay}</dd></div>
          <div className="flex flex-wrap justify-between gap-3"><dt>PAN</dt><dd>{BANK_DETAILS.pan}</dd></div>
        </dl>
      </div>

      <div className="max-w-2xl mx-auto mt-8 bg-cream-300/60 border border-saffron-200 rounded-2xl p-7">
        <h2 className="font-display text-xl text-vermilion-700">After you transfer</h2>
        <p className="text-sm text-ink/70 mt-3 leading-relaxed">Please email puneckpfamily@gmail.com or call 7447794477 with your transaction reference. The trust will issue an official receipt.</p>
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link href="/donate" className="rounded-full bg-vermilion-500 text-cream-100 px-6 py-3 font-semibold hover:bg-vermilion-600 transition-colors">Donate up to ₹10,000 online</Link>
        <Link href="/contact" className="rounded-full border-2 border-vermilion-500 text-vermilion-600 px-6 py-3 font-semibold hover:bg-vermilion-50 transition-colors">Contact the Trust</Link>
      </div>
    </div>
  );
}
