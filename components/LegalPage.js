import Link from 'next/link';
import PageHero from './PageHero';
import Reveal from './Reveal';

/**
 * Shared shell for the policy pages (terms, privacy, refunds). Keeps their
 * structure and tone identical so the trust reads as one organisation,
 * and so there is exactly one place to change the house style.
 */
export default function LegalPage({ label, title, intro, updated, sections, breadcrumbLabel }) {
  return (
    <>
      <PageHero
        eyebrow={label}
        title={title}
        intro={intro}
        breadcrumbs={[{ label: breadcrumbLabel || title }]}
        meta={<p className="font-mono text-xs text-ink/65">Last updated: {updated}</p>}
      />

      <div className="container-page section-y">
        <div className="mx-auto max-w-3xl space-y-5">
          {sections.map((section, i) => (
            <Reveal key={section.heading} delay={Math.min(i, 3) * 50}>
              <section className="card p-6 sm:p-7">
                <h2 className="h-card">{section.heading}</h2>
                {section.body.map((paragraph, j) => (
                  <p key={j} className="mt-3 text-sm leading-relaxed text-ink/80">{paragraph}</p>
                ))}
                {section.list && (
                  <ul className="mt-4 space-y-2">
                    {section.list.map((item) => (
                      <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink/75">
                        <span className="mt-1 text-vermilion-500" aria-hidden="true">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120} className="mt-12 text-center">
          <p className="text-sm text-ink/75">Questions about this policy?</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="btn btn-primary">Contact the trust</Link>
            <Link href="/faq" className="btn btn-outline">Read the FAQ</Link>
          </div>
        </Reveal>
      </div>
    </>
  );
}
