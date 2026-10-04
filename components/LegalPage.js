import Link from 'next/link';
import Breadcrumbs from './Breadcrumbs';
import Reveal from './Reveal';

/**
 * Shared shell for the policy pages (terms, privacy, refunds). Keeps their
 * structure and tone identical so the trust reads as one organisation —
 * and so there is exactly one place to change the house style.
 */
export default function LegalPage({ label, title, intro, updated, sections, breadcrumbLabel }) {
  return (
    <div className="container-page py-16 md:py-24">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: breadcrumbLabel || title }]} />

      <Reveal>
        <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">{label}</p>
        <h1 className="font-display text-4xl md:text-5xl text-center mt-3">{title}</h1>
        <p className="max-w-2xl mx-auto mt-5 text-center text-ink/70 leading-relaxed">{intro}</p>
        <p className="text-center text-xs text-ink/50 mt-4 font-mono">Last updated: {updated}</p>
      </Reveal>

      <div className="max-w-3xl mx-auto mt-14 space-y-6">
        {sections.map((section, i) => (
          <Reveal key={section.heading} delay={i * 50}>
            <section className="bg-cream-100 border border-saffron-200/70 rounded-2xl p-7">
              <h2 className="font-display text-xl text-vermilion-700">{section.heading}</h2>
              {section.body.map((paragraph, j) => (
                <p key={j} className="text-sm text-ink/75 mt-3 leading-relaxed">{paragraph}</p>
              ))}
              {section.list && (
                <ul className="mt-4 space-y-2">
                  {section.list.map((item) => (
                    <li key={item} className="text-sm text-ink/70 leading-relaxed flex gap-2">
                      <span className="text-vermilion-500 mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120} className="mt-14 text-center">
        <p className="text-sm text-ink/70">Questions about this policy?</p>
        <div className="flex flex-wrap justify-center gap-3 mt-5">
          <Link href="/contact" className="btn-press rounded-full bg-vermilion-500 text-cream-100 px-6 py-3 font-semibold hover:bg-vermilion-600">Contact the Trust</Link>
          <Link href="/faq" className="btn-press rounded-full border-2 border-vermilion-500 text-vermilion-600 px-6 py-3 font-semibold hover:bg-vermilion-50">Read the FAQ</Link>
        </div>
      </Reveal>
    </div>
  );
}
