import Link from 'next/link';
import DonationForm from '../../../components/DonationForm';
import PageHero from '../../../components/PageHero';
import SectionHeading from '../../../components/SectionHeading';
import Reveal, { Stagger } from '../../../components/Reveal';
import AreaIcon from '../../../components/AreaIcon';
import { buildMetadata } from '../../../lib/seo';
import { CONTRIBUTION_COUNTERS } from '../../../lib/impactData';

export const metadata = buildMetadata({
  title: 'Donate | Pune CKP Family Public Trust',
  description: 'Donate ₹100 to ₹10,000 online to Pune CKP Family Public Trust and receive an instant PDF receipt. Larger gifts can be sent by bank transfer or UPI.',
  path: '/donate',
});

const STEPS = [
  { icon: 'heart', title: 'Choose an amount', text: 'Any amount from ₹100 to ₹10,000 online.' },
  { icon: 'bank', title: 'Pay securely', text: 'Card, UPI, net banking or wallet, through Razorpay.' },
  { icon: 'medal', title: 'Get your receipt', text: 'A PDF receipt is ready the moment the payment is confirmed.' },
];

const ICONS = { education: 'book', health: 'heart', social: 'hands', environment: 'leaf' };

export default function DonatePage() {
  return (
    <>
      <PageHero
        eyebrow="Donate for our cause"
        title="Your gift goes to work for someone who needs it"
        intro="From a medical emergency to a child’s school bag, donations to the trust are put to work in education, healthcare, social welfare and the environment. Give ₹100 to ₹10,000 online and receive an instant PDF receipt."
        breadcrumbs={[{ label: 'Donate' }]}
      />

      <section className="container-page section-y !pb-0" aria-labelledby="donate-steps-heading">
        <h2 id="donate-steps-heading" className="sr-only">How donating works</h2>
        <Stagger as="ol" className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card flex items-start gap-4 p-5">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-vermilion-50 text-vermilion-700">
                <AreaIcon name={step.icon} className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-saffron-500 font-mono text-[11px] font-semibold text-ink" aria-hidden="true">{i + 1}</span>
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{step.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-ink/75">{step.text}</span>
              </span>
            </li>
          ))}
        </Stagger>
      </section>

      <section className="container-page py-12 md:py-16" aria-labelledby="donate-form-heading">
        <h2 id="donate-form-heading" className="sr-only">Donate online</h2>
        <DonationForm />

        <Reveal className="mx-auto mt-10 flex max-w-2xl flex-col items-center justify-between gap-4 rounded-3xl border border-saffron-200 bg-cream-300/50 px-6 py-5 text-center md:flex-row md:text-left">
          <p className="text-sm leading-relaxed text-ink/80">Planning a larger donation, or prefer a direct transfer? Use the trust’s bank or G-Pay details.</p>
          <Link href="/donate/bank-transfer" className="btn btn-sm btn-outline shrink-0">Bank transfer details</Link>
        </Reveal>
      </section>

      <section className="border-y border-saffron-200 bg-white/60" aria-labelledby="where-heading">
        <div className="container-page section-y">
          <SectionHeading id="where-heading" eyebrow="Where it goes" title="Four kinds of work your donation supports" />
          <Stagger as="ul" className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CONTRIBUTION_COUNTERS.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="card card-hover group flex h-full flex-col p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-saffron-100 text-vermilion-700"><AreaIcon name={ICONS[item.key]} /></span>
                  <h3 className="mt-4 text-sm font-semibold text-ink">{item.label}</h3>
                  <p className="mt-1.5 flex-1 text-xs leading-relaxed text-ink/70">{item.note}</p>
                  <p className="mt-3 font-mono text-sm font-semibold text-vermilion-700">₹{item.amount.toLocaleString('en-IN')} so far</p>
                </Link>
              </li>
            ))}
          </Stagger>
          <Reveal className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/impact" className="btn btn-outline">Donations &amp; impact</Link>
            <Link href="/faq" className="btn btn-outline">Questions about donating</Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
