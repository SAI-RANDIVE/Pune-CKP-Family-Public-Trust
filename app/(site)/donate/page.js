import DonationForm from '../../../components/DonationForm';
import Link from 'next/link';
import { buildMetadata } from '../../../lib/seo';

export const metadata = buildMetadata({
  title: 'Donate | Pune CKP Family Public Trust',
  description: 'Donate ₹100 to ₹10,000 online to Pune CKP Family Public Trust and receive an instant PDF receipt. Larger gifts can be sent by bank transfer or UPI.',
  path: '/donate',
});

export default function DonatePage() {
  return (
    <div className="container-page py-16 md:py-24">
      <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">Donate for our cause</p>
      <h1 className="font-display text-4xl md:text-5xl text-center mt-3">Every rupee reaches someone who needs it</h1>
      <p className="text-center text-ink/70 max-w-xl mx-auto mt-4 leading-relaxed">
        From medical emergencies to a child&apos;s school bag, your donation is put to work
        quickly and transparently. Online donations up to ₹10,000 are supported here —
        you&apos;ll receive an instant PDF receipt.
      </p>

      <div className="mt-14">
        <DonationForm />
      </div>

      <p className="text-center text-sm text-ink/70 mt-10">
        Planning a larger donation? <Link href="/donate/bank-transfer" className="font-semibold text-vermilion-600 hover:text-vermilion-700">View bank transfer details</Link>.
      </p>
    </div>
  );
}
