import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import SectionHeading from '../../../components/SectionHeading';
import Reveal, { Stagger } from '../../../components/Reveal';
import AreaIcon from '../../../components/AreaIcon';
import CtaBanner from '../../../components/CtaBanner';
import JsonLd from '../../../components/JsonLd';
import { ProjectCard } from '../../../components/Cards';
import { buildMetadata, getSiteUrl } from '../../../lib/seo';
import { PROJECTS, UPCOMING_PROJECTS } from '../../../lib/projectsData';
import { coverOf } from '../../../lib/galleryData';

export const metadata = buildMetadata({
  title: 'Projects | Pune CKP Family Public Trust',
  description: 'The projects of Pune CKP Family Public Trust: Dnyan Kiran student aid, Project Diya bicycles, Project Udaan, Niramay Arogya Yojana, Blossoming Buds and Mahad relief.',
  path: '/projects',
});

export default function ProjectsPage() {
  const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Projects of Pune CKP Family Public Trust',
    itemListElement: PROJECTS.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title, url: `${getSiteUrl()}/projects/${p.slug}` })),
  };

  return (
    <>
      <JsonLd data={listSchema} />
      <PageHero
        eyebrow="Projects"
        title="The trust’s projects"
        intro="Education for rural students, medical help for families, support for deaf-mute children and for girls in rural areas: the trust’s main projects, each with a single clear purpose."
        breadcrumbs={[{ label: 'Projects' }]}
      >
        <Link href="/donate" className="btn btn-primary">Support a project</Link>
        <Link href="/impact" className="btn btn-outline">Donations &amp; impact</Link>
      </PageHero>

      <section className="container-page section-y" aria-labelledby="projects-list-heading">
        <h2 id="projects-list-heading" className="sr-only">All projects</h2>
        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECTS.map((project) => <ProjectCard key={project.slug} project={project} image={coverOf(project)} />)}
        </Stagger>
      </section>

      <section className="border-y border-saffron-200 bg-cream-300/50" aria-labelledby="upcoming-heading">
        <div className="container-page section-y">
          <SectionHeading id="upcoming-heading" eyebrow="Looking ahead" title="Upcoming CSR projects" intro={UPCOMING_PROJECTS.intro} />
          <Stagger as="ul" className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
            {UPCOMING_PROJECTS.items.map((item) => (
              <li key={item.title} className="card p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-saffron-100 text-saffron-800"><AreaIcon name="leaf" className="h-5 w-5" /></span>
                <h3 className="h-card mt-4">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/75">{item.text}</p>
                <p className="mt-3 inline-flex rounded-full bg-cream-300 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink/75">Planned</p>
              </li>
            ))}
          </Stagger>
          <Reveal className="mt-10 text-center">
            <Link href="/contact" className="btn btn-outline">Talk to the trust about CSR support</Link>
          </Reveal>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
