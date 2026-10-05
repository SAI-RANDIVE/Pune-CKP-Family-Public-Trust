import Link from 'next/link';
import Breadcrumbs from '../../../components/Breadcrumbs';
import JsonLd from '../../../components/JsonLd';
import Reveal from '../../../components/Reveal';
import { FAQS, FAQ_CATEGORIES } from '../../../lib/faqData';
import { buildMetadata } from '../../../lib/seo';

export const metadata = buildMetadata({
  title: 'Frequently Asked Questions | Pune CKP Family Public Trust',
  description: 'Answers on donating, receipts, tax certificates, refunds and the Silver, Gold and Platinum membership tiers at Pune CKP Family Public Trust.',
  path: '/faq',
});

export default function FaqPage() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  return (
    <div className="container-page py-16 md:py-24">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'FAQ' }]} />
      <JsonLd data={faqSchema} />

      <Reveal>
        <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">Questions &amp; Answers</p>
        <h1 className="font-display text-4xl md:text-5xl text-center mt-3">Frequently Asked Questions</h1>
        <p className="max-w-2xl mx-auto mt-5 text-center text-ink/70 leading-relaxed">
          The things donors and members ask most often, answered directly. If your question
          isn&rsquo;t here, <Link href="/contact" className="link-underline font-semibold text-vermilion-600">contact the trust</Link> and
          someone will get back to you.
        </p>
      </Reveal>

      {FAQ_CATEGORIES.map((category) => (
        <section key={category} className="mt-14 max-w-3xl mx-auto">
          <Reveal>
            <h2 className="font-display text-2xl text-vermilion-700">{category}</h2>
          </Reveal>
          <div className="mt-6 space-y-4">
            {FAQS.filter((f) => f.category === category).map((f, i) => (
              <Reveal key={f.question} delay={i * 60}>
                <details className="soft-card group bg-cream-100 border border-saffron-200/70 rounded-2xl p-6 open:border-vermilion-400">
                  <summary className="flex cursor-pointer items-start justify-between gap-4 list-none">
                    <h3 className="font-semibold text-ink group-open:text-vermilion-700 transition-colors">{f.question}</h3>
                    <span aria-hidden="true" className="mt-0.5 shrink-0 text-vermilion-500 transition-transform duration-300 group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-4 text-sm text-ink/75 leading-relaxed">{f.answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>
      ))}

      <Reveal delay={120} className="mt-16 flex flex-wrap justify-center gap-3">
        <Link href="/donate" className="btn-press rounded-full bg-vermilion-500 text-cream-100 px-6 py-3 font-semibold hover:bg-vermilion-600">Donate now</Link>
        <Link href="/membership" className="btn-press rounded-full border-2 border-vermilion-500 text-vermilion-600 px-6 py-3 font-semibold hover:bg-vermilion-50">Become a member</Link>
      </Reveal>
    </div>
  );
}
