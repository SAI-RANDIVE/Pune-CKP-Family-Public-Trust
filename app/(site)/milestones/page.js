import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import MilestoneTimeline from '../../../components/MilestoneTimeline';
import SectionHeading from '../../../components/SectionHeading';
import Reveal from '../../../components/Reveal';
import CtaBanner from '../../../components/CtaBanner';
import JsonLd from '../../../components/JsonLd';
import { buildMetadata, getSiteUrl } from '../../../lib/seo';
import { ROADMAP, LATER_MILESTONES, ALL_MILESTONES, MILESTONE_YEARS } from '../../../lib/timelineData';

export const metadata = buildMetadata({
  title: 'Milestones 2016 to 2025 | Pune CKP Family Public Trust',
  description: 'The full timeline of Pune CKP Family Public Trust: from the first step on 11 January 2016, through relief work, projects and every Gaurav Sohala, to 2025.',
  path: '/milestones',
});

export default function MilestonesPage() {
  const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Milestones of Pune CKP Family Public Trust',
    url: `${getSiteUrl()}/milestones`,
    numberOfItems: ALL_MILESTONES.length,
    itemListElement: ALL_MILESTONES.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: `${m.date}: ${m.title}`, description: m.text })),
  };

  return (
    <>
      <JsonLd data={listSchema} />
      <PageHero
        eyebrow="Milestones"
        title="A journey of a thousand miles starts with a single step"
        intro={`${ALL_MILESTONES.length} milestones, from a WhatsApp group in January 2016 to the Gaurav Sohala of 2025.`}
        breadcrumbs={[{ label: 'About the Trust', href: '/about' }, { label: 'Milestones' }]}
      />

      <div className="container-page section-y">
        <nav aria-label="Jump to a year" className="mx-auto mb-12 max-w-3xl">
          <ul className="flex flex-wrap gap-2">
            {MILESTONE_YEARS.map((year) => (
              <li key={year}>
                <a href={`#year-${year}`} className="inline-flex min-h-[2.75rem] items-center rounded-full border border-saffron-300 bg-white px-4 text-sm font-semibold text-vermilion-700 transition-colors hover:bg-saffron-100">{year}</a>
              </li>
            ))}
          </ul>
        </nav>

        <MilestoneTimeline items={ALL_MILESTONES} />

        <Reveal className="mx-auto mt-6 max-w-3xl rounded-2xl border border-saffron-200 bg-cream-300/50 px-5 py-4 text-sm leading-relaxed text-ink/75">
          The first {ROADMAP.length} entries, up to September 2021, are the trust&rsquo;s own roadmap. The {LATER_MILESTONES.length} after
          that are taken from its Gaurav Sohala records and its photo and video albums.
        </Reveal>
      </div>

      <section className="border-y border-saffron-200 bg-cream-300/50">
        <div className="container-page section-y text-center">
          <SectionHeading eyebrow="Keep reading" title="The story behind the dates" />
          <Reveal className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/about" className="btn btn-primary">About the trust</Link>
            <Link href="/events" className="btn btn-outline">Events &amp; activities</Link>
            <Link href="/gaurav-sohala" className="btn btn-outline">Gaurav Sohala</Link>
          </Reveal>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
