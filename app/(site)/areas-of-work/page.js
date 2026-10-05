import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import { Stagger } from '../../../components/Reveal';
import { AreaCard } from '../../../components/ObjectivesSection';
import StatsSection from '../../../components/StatsSection';
import CtaBanner from '../../../components/CtaBanner';
import JsonLd from '../../../components/JsonLd';
import { AREAS_OF_WORK } from '../../../lib/areasOfWorkData';
import { buildMetadata, getSiteUrl } from '../../../lib/seo';

export const metadata = buildMetadata({
  title: 'Areas of Work | Pune CKP Family Public Trust',
  description: 'Education, medical aid, environment, social welfare and sport, the five objectives of Pune CKP Family Public Trust, plus its work in literature and art.',
  path: '/areas-of-work',
});

export default function AreasOfWorkPage() {
  const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Areas of work of Pune CKP Family Public Trust',
    itemListElement: AREAS_OF_WORK.map((area, i) => ({ '@type': 'ListItem', position: i + 1, name: area.title, url: `${getSiteUrl()}/areas-of-work/${area.slug}` })),
  };

  return (
    <>
      <JsonLd data={listSchema} />
      <PageHero
        eyebrow="Our Work"
        title="Areas of work"
        intro="The trust deed sets out five fields of work: educational, medical, environmental, social and sports. Vision 2021 added literature and art. Each has its own objectives, schemes and record of work."
        breadcrumbs={[{ label: 'Areas of Work' }]}
      >
        <Link href="/projects" className="btn btn-primary">See the projects</Link>
        <Link href="/impact" className="btn btn-outline">Donations &amp; impact</Link>
      </PageHero>

      <section className="container-page section-y" aria-labelledby="areas-list-heading">
        <h2 id="areas-list-heading" className="sr-only">The six areas</h2>
        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS_OF_WORK.map((area, index) => <AreaCard key={area.slug} area={area} index={index} />)}
        </Stagger>
      </section>

      <div className="border-y border-saffron-200 bg-white/60">
        <StatsSection />
      </div>

      <CtaBanner />
    </>
  );
}
