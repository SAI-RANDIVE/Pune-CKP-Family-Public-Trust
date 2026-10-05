import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import JsonLd from '../../../components/JsonLd';
import Reveal from '../../../components/Reveal';
import { FAQS, FAQ_CATEGORIES } from '../../../lib/faqData';
import { buildMetadata } from '../../../lib/seo';

export const metadata = buildMetadata({
  title: 'Frequently Asked Questions | Pune CKP Family Public Trust',
  description: 'Answers on donating, receipts, tax certificates, refunds and the Silver, Gold and Platinum membership tiers at Pune CKP Family Public Trust.',
  path: '/faq',
});

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
    <>
      <JsonLd data={faqSchema} />
      <PageHero
        eyebrow="Questions & Answers"
        title="Frequently asked questions"
        intro="The things donors and members ask most often, answered directly."
        breadcrumbs={[{ label: 'FAQ' }]}
      >
        {FAQ_CATEGORIES.map((category) => (
          <a key={category} href={`#${slugify(category)}`} className="inline-flex min-h-[2.75rem] items-center rounded-full border border-saffron-300 bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-vermilion-400 hover:text-vermilion-700">{category}</a>
        ))}
      </PageHero>

      <div className="container-page section-y">
        <div className="mx-auto max-w-3xl">
          {FAQ_CATEGORIES.map((category, groupIndex) => (
            <section key={category} id={slugify(category)} aria-labelledby={`${slugify(category)}-heading`} className={`scroll-mt-28 ${groupIndex === 0 ? '' : 'mt-14'}`}>
              <Reveal>
                <h2 id={`${slugify(category)}-heading`} className="h-section !text-2xl">{category}</h2>
              </Reveal>
              <div className="mt-6 space-y-3">
                {FAQS.filter((f) => f.category === category).map((f, i) => (
                  <Reveal key={f.question} delay={Math.min(i, 4) * 50}>
                    <details className="card group open:border-vermilion-400">
                      <summary className="flex min-h-[3.25rem] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6">
                        <h3 className="font-semibold leading-snug text-ink transition-colors group-open:text-vermilion-700">{f.question}</h3>
                        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-saffron-100 text-lg leading-none text-vermilion-700 transition-transform duration-300 group-open:rotate-45">+</span>
                      </summary>
                      <p className="px-5 pb-5 text-sm leading-relaxed text-ink/80 sm:px-6">{f.answer}</p>
                    </details>
                  </Reveal>
                ))}
              </div>
            </section>
          ))}

          <Reveal className="mt-14 rounded-3xl border border-saffron-200 bg-cream-300/50 p-6 text-center sm:p-8">
            <h2 className="h-card">Still have a question?</h2>
            <p className="mt-2 text-sm text-ink/75">Contact the trust and someone will get back to you.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/contact" className="btn btn-primary">Contact the trust</Link>
              <Link href="/donate" className="btn btn-outline">Donate now</Link>
              <Link href="/membership" className="btn btn-outline">Become a member</Link>
            </div>
          </Reveal>
        </div>
      </div>
    </>
  );
}
